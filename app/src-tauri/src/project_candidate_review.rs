use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_core::{
    count_words, is_placeholder_or_empty, normalize_chapter_id, read_optional_project_file,
};
use crate::project_events::append_workflow_task_history;
use crate::project_knowledge::read_character_context;
use crate::project_timeline::read_timeline_context;
use crate::project_types::{
    CandidateFactAdoptionResult, CandidateReviewIssue, ContractFulfillmentSummary, ProjectError,
    ProjectFileDocument, StoryContractSummary,
};

#[derive(Debug, Clone)]
pub(crate) struct StyleFingerprint {
    source_chapter_count: usize,
    total_units: usize,
    average_sentence_units: usize,
    average_paragraph_units: usize,
    dialogue_ratio_percent: usize,
    common_terms: Vec<String>,
    repeated_phrases: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct AdoptedCandidateFact {
    text: String,
    category_path: String,
}

pub(crate) fn load_project_style_fingerprint(
    root: &Path,
) -> Result<Option<StyleFingerprint>, ProjectError> {
    let dir = ensure_project_path(root, "manuscript/chapters")?;
    if !dir.exists() {
        return Ok(None);
    }

    let mut chapters = Vec::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().and_then(|value| value.to_str()) == Some("md") {
            let content = fs::read_to_string(path)?;
            let body = strip_markdown_headings(&content);
            if !is_placeholder_or_empty(&content) && count_words(&body) >= 80 {
                chapters.push(body);
            }
        }
    }

    if chapters.is_empty() {
        Ok(None)
    } else {
        Ok(Some(analyze_style_fingerprint(&chapters)))
    }
}

pub(crate) fn strip_markdown_headings(content: &str) -> String {
    content
        .lines()
        .filter(|line| !line.trim_start().starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn analyze_style_fingerprint(chapters: &[String]) -> StyleFingerprint {
    let corpus = chapters.join("\n\n");
    let total_units = count_words(&corpus);
    let sentences = split_style_sentences(&corpus);
    let paragraphs = split_style_paragraphs(&corpus);
    let dialogue_units: usize = corpus
        .lines()
        .filter(|line| is_dialogue_line(line))
        .map(count_words)
        .sum();

    StyleFingerprint {
        source_chapter_count: chapters.len(),
        total_units,
        average_sentence_units: average_unit_count(&sentences),
        average_paragraph_units: average_unit_count(&paragraphs),
        dialogue_ratio_percent: if total_units == 0 {
            0
        } else {
            (dialogue_units * 100 / total_units).min(100)
        },
        common_terms: extract_common_style_terms(&corpus, 8),
        repeated_phrases: extract_repeated_style_phrases(&corpus, 8),
    }
}

pub(crate) fn split_style_sentences(content: &str) -> Vec<String> {
    split_sentence_like(content)
        .into_iter()
        .filter(|sentence| count_words(sentence) >= 4)
        .collect()
}

pub(crate) fn split_style_paragraphs(content: &str) -> Vec<String> {
    content
        .split("\n\n")
        .map(str::trim)
        .filter(|paragraph| count_words(paragraph) >= 8)
        .map(ToOwned::to_owned)
        .collect()
}

pub(crate) fn average_unit_count(items: &[String]) -> usize {
    if items.is_empty() {
        0
    } else {
        items.iter().map(|value| count_words(value)).sum::<usize>() / items.len()
    }
}

pub(crate) fn is_dialogue_line(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.contains('"')
        || trimmed.contains('“')
        || trimmed.contains('”')
        || trimmed.contains('「')
        || trimmed.contains('」')
        || (trimmed.starts_with('-') && (trimmed.contains(':') || trimmed.contains('：')))
}

pub(crate) fn extract_common_style_terms(content: &str, limit: usize) -> Vec<String> {
    let mut counts = HashMap::new();
    for term in [
        "雨", "风", "灯", "门", "窗", "影", "声", "血", "钥匙", "信", "楼", "玻璃",
    ] {
        let count = content.matches(term).count();
        if count >= 2 {
            counts.insert(term.to_string(), count);
        }
    }
    sorted_count_labels(counts, limit)
}

pub(crate) fn extract_repeated_style_phrases(content: &str, limit: usize) -> Vec<String> {
    let chars = content
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || is_cjk(*value))
        .collect::<Vec<_>>();
    let mut counts = HashMap::new();
    for window in chars.windows(4) {
        let phrase = window.iter().collect::<String>();
        if phrase.chars().all(is_cjk) {
            *counts.entry(phrase).or_insert(0) += 1;
        }
    }
    counts.retain(|_, count| *count >= 2);
    sorted_count_labels(counts, limit)
}

fn sorted_count_labels(mut counts: HashMap<String, usize>, limit: usize) -> Vec<String> {
    let mut values = counts.drain().collect::<Vec<_>>();
    values.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
    values
        .into_iter()
        .take(limit)
        .map(|(term, count)| format!("{term} ({count})"))
        .collect()
}

pub(crate) fn compose_style_fingerprint_guidance(
    fingerprint: Option<&StyleFingerprint>,
    style_config: &str,
) -> String {
    let manual = markdown_lines_or_empty(
        &extract_style_control_lines(style_config),
        "No manual style locks/exclusions found in framework/06-style.md.",
    );
    match fingerprint {
        Some(value) => format!(
            "## Style Fingerprint v1\n\n\
             - Source chapters: {}\n\
             - Source units: {}\n\
             - Average sentence units: {}\n\
             - Average paragraph units: {}\n\
             - Dialogue ratio: {}%\n\
             - Recurring imagery / objects: {}\n\
             - Repeated phrase watchlist: {}\n\
             - Generation constraint: keep new candidate prose close to this range unless the chapter blueprint explicitly asks for a style break.\n\n\
             ### Manual style controls\n\n{manual}\n\n",
            value.source_chapter_count,
            value.total_units,
            value.average_sentence_units,
            value.average_paragraph_units,
            value.dialogue_ratio_percent,
            style_list_or_empty(&value.common_terms),
            style_list_or_empty(&value.repeated_phrases),
        ),
        None => format!(
            "## Style Fingerprint v1\n\n\
             - Not enough confirmed manuscript yet.\n\n\
             ### Manual style controls\n\n{manual}\n\n"
        ),
    }
}

pub(crate) fn write_style_fingerprint_snapshot(
    root: &Path,
    fingerprint: &StyleFingerprint,
    style_config: &str,
) -> Result<(), ProjectError> {
    atomic_write_text(
        &ensure_project_path(root, ".olienta/style-fingerprint.md")?,
        &compose_style_fingerprint_guidance(Some(fingerprint), style_config),
    )?;
    Ok(())
}

pub(crate) fn style_list_or_empty(values: &[String]) -> String {
    if values.is_empty() {
        "-".to_owned()
    } else {
        values.join(", ")
    }
}

pub(crate) fn extract_style_control_lines(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| {
            line.starts_with('-')
                || line.contains("锁定")
                || line.contains("禁用")
                || line.contains("禁止")
                || line.to_ascii_lowercase().contains("avoid")
        })
        .map(ToOwned::to_owned)
        .collect()
}

pub(crate) fn extract_excluded_style_terms(content: &str) -> Vec<String> {
    extract_style_control_lines(content)
        .into_iter()
        .filter(|line| {
            line.contains("禁用")
                || line.contains("禁止")
                || line.to_ascii_lowercase().contains("avoid")
        })
        .flat_map(|line| constraint_keywords(&line))
        .collect()
}

#[allow(dead_code)]
pub fn review_candidate_draft(content: String) -> Vec<String> {
    review_candidate_content(&content)
}

pub fn review_candidate_draft_issues(content: String) -> Vec<CandidateReviewIssue> {
    candidate_review_issues_from_warnings(&review_candidate_content(&content))
}

pub fn review_candidate_draft_for_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<Vec<String>, ProjectError> {
    review_candidate_with_context(
        &PathBuf::from(root_path),
        &normalize_chapter_id(&chapter_id),
        &content,
    )
}

pub fn review_candidate_draft_issues_for_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<Vec<CandidateReviewIssue>, ProjectError> {
    Ok(candidate_review_issues_from_warnings(
        &review_candidate_draft_for_chapter(root_path, chapter_id, content)?,
    ))
}

pub(crate) fn candidate_review_issues_from_warnings(
    warnings: &[String],
) -> Vec<CandidateReviewIssue> {
    warnings
        .iter()
        .map(|warning| {
            let category = if has_any(warning, &["合同", "蓝图", "必须项", "禁写项"]) {
                "contract"
            } else if has_any(warning, &["回修"]) {
                "revision"
            } else if has_any(warning, &["AI味", "套话", "情绪直说", "对抗式删改"]) {
                "ai_flavor"
            } else if has_any(warning, &["读者面板", "段落过长", "阅读压力"]) {
                "pacing"
            } else if warning.contains("Style Fingerprint") {
                "style"
            } else if has_any(warning, &["伏笔", "事实"]) {
                "facts"
            } else {
                "quality"
            };
            let severity = if has_any(warning, &["禁写", "违反", "未完成", "触碰"]) {
                "danger"
            } else if warning.contains("可能") || warning.contains("偏") {
                "warning"
            } else {
                "info"
            };
            CandidateReviewIssue {
                severity: severity.to_owned(),
                category: category.to_owned(),
                location: "candidate".to_owned(),
                description: warning.clone(),
                evidence: trim_for_status(warning),
                fix_hint: "按作者判断保留、重写或忽略。".to_owned(),
                blocking: matches!(category, "contract" | "revision") && severity == "danger",
            }
        })
        .collect()
}

pub(crate) fn review_candidate_against_anti_ai_patterns(content: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    for pattern in ["作为一个AI", "作为AI", "我无法", "AI不能", "我不能提供"] {
        if content.contains(pattern) {
            warnings.push(format!(
                "AI味/套话：候选稿出现模型自我声明或拒答痕迹：{pattern}"
            ));
        }
    }
    warnings
}

pub(crate) fn review_candidate_against_autonovel_quality(content: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    for (pattern, label) in [
        ("突然", "突发转折"),
        ("然后", "流水账承接"),
        ("其实", "解释性转折"),
        ("命运", "抽象升格"),
        ("他终于明白", "总结式顿悟"),
        ("无法言说", "空泛感受"),
        ("一切都变了", "泛化收束"),
    ] {
        let count = content.matches(pattern).count();
        if count >= 2 {
            warnings.push(format!("AI味/套话：{label} “{pattern}” 重复 {count} 次。"));
        }
    }
    for pattern in ["感到害怕", "感到愤怒", "心里一震", "说不出的"] {
        if content.contains(pattern) {
            warnings.push(format!(
                "AI味/情绪直说：{pattern} 可改为可见动作。"
            ));
        }
    }
    warnings
}

pub(crate) fn review_candidate_against_reader_panel(content: &str) -> Vec<String> {
    if content
        .split("\n\n")
        .any(|paragraph| count_words(paragraph) > 220)
    {
        vec![
            "读者面板/主编：段落过长。".to_owned(),
            "读者面板/类型读者：信息密度过高。".to_owned(),
            "读者面板/作者技法：可改成可拍摄动作。".to_owned(),
            "读者面板/普通读者：阅读压力偏高。".to_owned(),
        ]
    } else if !content.trim().is_empty() {
        vec!["读者面板/主编：候选稿已进入可审读状态，请作者按节奏决定保留。".to_owned()]
    } else {
        Vec::new()
    }
}

pub(crate) fn review_candidate_against_adversarial_cuts(content: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    if content.matches("然后").count() >= 3 {
        warnings.push("对抗式删改清单：STRUCTURAL 连续顺承过多。".to_owned());
        warnings.push("对抗式删改清单：REDUNDANT 合并同义反应。".to_owned());
    }
    if has_any(content, &["也就是说", "也就是說"]) {
        warnings.push("对抗式删改清单：OVER-EXPLAIN 解释过度。".to_owned());
    }
    if has_any(content, &["命运", "一切都变了"]) {
        warnings.push("对抗式删改清单：GENERIC 抽象词过多。".to_owned());
    }
    if has_any(content, &["感到", "心里一震"]) {
        warnings.push("对抗式删改清单：TELL 情绪直说。".to_owned());
    }
    warnings
}

pub(crate) fn write_candidate_fact_draft(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<String, ProjectError> {
    let id = normalize_chapter_id(chapter_id);
    let relative_path = format!("facts/candidate-fact-drafts/{id}.md");
    let mut lines = vec![
        format!("# 第 {id} 章候选事实草稿"),
        String::new(),
        "待确认伏笔账本".to_owned(),
        String::new(),
    ];

    let candidates = extract_candidate_open_loop_items(content, &id);
    if candidates.is_empty() {
        let pending = split_candidate_sentences(content)
            .into_iter()
            .next()
            .unwrap_or_else(|| "本章留下一个待确认伏笔。".to_owned());
        let harvested = split_candidate_sentences(content)
            .into_iter()
            .nth(1)
            .unwrap_or_else(|| "本章可能回收一个既有伏笔。".to_owned());
        lines.push(format!(
            "- [ ] [pending] {pending} <!-- path:facts/open-loops.md; reason:fallback-open-loop -->"
        ));
        lines.push(format!(
            "- [ ] [harvested] {harvested} <!-- path:facts/open-loops.md; reason:fallback-payoff -->"
        ));
    } else {
        let mut used_pending = false;
        let mut used_harvested = false;
        let mut used_confirmed = false;
        for sentence in candidates.into_iter().take(24) {
            let (path, tag, reason) = classify_candidate_fact(&sentence);
            if (tag == "pending" && used_pending)
                || (tag == "harvested" && used_harvested)
                || (tag == "confirmed" && used_confirmed)
            {
                continue;
            }
            if tag == "pending" {
                used_pending = true;
            } else if tag == "harvested" {
                used_harvested = true;
            } else {
                used_confirmed = true;
            }
            lines.push(format!(
                "- [ ] [{tag}] {sentence} <!-- path:{path}; reason:{reason} -->"
            ));
        }

        let has_pending = lines.iter().any(|line| line.contains("[pending]"));
        let has_harvested = lines.iter().any(|line| line.contains("[harvested]"));
        if !has_pending {
            lines.push("- [ ] [pending] 本章留下一个待确认伏笔。 <!-- path:facts/open-loops.md; reason:fallback-open-loop -->".to_owned());
        }
        if !has_harvested {
            lines.push("- [ ] [harvested] 本章可能回收一个既有伏笔。 <!-- path:facts/open-loops.md; reason:fallback-payoff -->".to_owned());
        }
    }

    atomic_write_text(
        &ensure_project_path(root, &relative_path)?,
        &format!("{}\n", lines.join("\n")),
    )?;
    Ok(relative_path)
}

pub(crate) fn extract_candidate_open_loop_items(content: &str, _: &str) -> Vec<String> {
    split_candidate_sentences(content)
        .into_iter()
        .filter(|sentence| looks_like_new_loop(sentence) || looks_like_loop_payoff(sentence))
        .take(24)
        .collect()
}

pub(crate) fn split_candidate_sentences(content: &str) -> Vec<String> {
    split_sentence_like(content)
        .into_iter()
        .map(|line| {
            line.trim_start_matches(['-', '*', '#', ' '])
                .trim()
                .to_owned()
        })
        .filter(|line| count_words(line) >= 3)
        .collect()
}

pub(crate) fn looks_like_new_loop(sentence: &str) -> bool {
    has_any(
        sentence,
        &[
            "承诺",
            "尚未",
            "秘密",
            "线索",
            "伏笔",
            "钥匙",
            "信封",
            "三天后",
            "未解释",
            "没有说完",
        ],
    )
}

pub(crate) fn looks_like_loop_payoff(sentence: &str) -> bool {
    has_any(
        sentence,
        &[
            "原来",
            "终于明白",
            "答案",
            "解释",
            "闭合",
            "兑现",
            "回收",
            "真相",
        ],
    )
}

pub(crate) fn classify_candidate_fact(sentence: &str) -> (&'static str, &'static str, &'static str) {
    if looks_like_loop_payoff(sentence) {
        ("facts/open-loops.md", "harvested", "open-loop payoff")
    } else if looks_like_new_loop(sentence) {
        ("facts/open-loops.md", "pending", "new open loop")
    } else {
        (
            "facts/confirmed-facts.md",
            "confirmed",
            "confirmed story fact",
        )
    }
}

pub fn adopt_candidate_fact_draft(
    root_path: String,
    draft_path: String,
) -> Result<CandidateFactAdoptionResult, ProjectError> {
    let root = PathBuf::from(root_path);
    let normalized = draft_path.replace('\\', "/");
    if !normalized.starts_with("facts/candidate-fact-drafts/") || !normalized.ends_with(".md") {
        return Err(ProjectError::InvalidInput(
            "candidate fact draft path must stay inside facts/candidate-fact-drafts".to_owned(),
        ));
    }

    let content = fs::read_to_string(ensure_project_path(&root, &normalized)?)?;
    let adopted = parse_adopted_candidate_fact_lines(&content);
    let mut classified_paths = Vec::new();

    for fact in &adopted {
        let target = ensure_project_path(&root, &fact.category_path)?;
        let mut existing = fs::read_to_string(&target).unwrap_or_default();
        if !existing.ends_with('\n') && !existing.is_empty() {
            existing.push('\n');
        }
        existing.push_str(&format!("- {}\n", fact.text));
        atomic_write_text(&target, &existing)?;
        if !classified_paths.contains(&fact.category_path) {
            classified_paths.push(fact.category_path.clone());
        }
    }

    let confirmed_facts =
        fs::read_to_string(ensure_project_path(&root, "facts/confirmed-facts.md")?)
            .unwrap_or_default();

    Ok(CandidateFactAdoptionResult {
        draft_path: normalized,
        confirmed_facts: ProjectFileDocument {
            relative_path: "facts/confirmed-facts.md".to_owned(),
            content: confirmed_facts,
        },
        adopted_count: adopted.len(),
        skipped_count: content
            .lines()
            .filter(|line| line.trim_start().starts_with("- [ ]"))
            .count(),
        classified_paths,
    })
}

pub(crate) fn parse_adopted_candidate_fact_lines(content: &str) -> Vec<AdoptedCandidateFact> {
    content
        .lines()
        .filter(|line| {
            let trimmed = line.trim_start();
            trimmed.starts_with("- [x]") || trimmed.starts_with("- [X]")
        })
        .map(|line| {
            let category_path = line
                .split("path:")
                .nth(1)
                .and_then(|tail| tail.split(';').next())
                .unwrap_or("facts/confirmed-facts.md")
                .trim()
                .to_owned();
            let text = line
                .split("<!--")
                .next()
                .unwrap_or(line)
                .replace("- [x]", "")
                .replace("- [X]", "")
                .replace("[confirmed]", "")
                .trim()
                .to_owned();
            AdoptedCandidateFact {
                text,
                category_path,
            }
        })
        .filter(|fact| !fact.text.is_empty())
        .collect()
}

pub(crate) fn write_candidate_review_report(
    root: &Path,
    chapter_id: &str,
    candidate_path: &str,
    writing_brief_path: &str,
    warnings: &[String],
) -> Result<String, ProjectError> {
    let id = normalize_chapter_id(chapter_id);
    let relative_path = format!("manuscript/candidates/reviews/{id}.md");
    let mut output = format!(
        "# 第 {id} 章候选稿审查报告\n\n\
         ### 生成与任务书\n\n\
         - 候选稿：{candidate_path}\n\
         - 写作要求：{writing_brief_path}\n\
         - 风险数量：{}\n\n",
        warnings.len()
    );

    for (title, items) in grouped_candidate_warnings(warnings) {
        output.push_str(&format!("## {title}\n\n"));
        if items.is_empty() {
            output.push_str("- 暂无。\n\n");
        } else {
            for item in items {
                output.push_str(&format!("- {item}\n"));
            }
            output.push('\n');
        }
    }

    atomic_write_text(&ensure_project_path(root, &relative_path)?, &output)?;
    Ok(relative_path)
}

pub(crate) fn grouped_candidate_warnings(warnings: &[String]) -> Vec<(&'static str, Vec<&String>)> {
    let groups: [(&str, fn(&str) -> bool); 7] = [
        ("合同与蓝图", |value| {
            has_any(value, &["合同", "蓝图", "必须项", "禁写项"])
        }),
        ("事实与伏笔", |value| has_any(value, &["事实", "伏笔"])),
        ("Style Fingerprint v1", |value| {
            value.contains("Style Fingerprint")
        }),
        ("AI味与文本质量", |value| {
            has_any(value, &["AI味", "套话", "情绪直说"])
        }),
        ("对抗式删改清单", |value| value.contains("对抗式删改清单")),
        ("读者面板", |value| value.contains("读者面板")),
        ("其它", |_| true),
    ];

    groups
        .into_iter()
        .map(|(name, predicate)| {
            (
                name,
                warnings
                    .iter()
                    .filter(|warning| predicate(warning))
                    .collect::<Vec<_>>(),
            )
        })
        .collect()
}

pub(crate) fn collect_labeled_lines(content: &str, labels: &[&str]) -> Vec<String> {
    let mut result = collect_contract_section_lines(content, labels);
    for raw in content.lines() {
        let line = raw.trim();
        if is_markdown_heading(line) {
            continue;
        }
        for label in labels {
            for separator in ["：", ":"] {
                if let Some(rest) = line.strip_prefix(&format!("{label}{separator}")) {
                    push_contract_line(&mut result, rest);
                }
            }
        }
    }
    dedupe(result)
}

pub(crate) fn collect_contract_section_lines(content: &str, labels: &[&str]) -> Vec<String> {
    let mut result = Vec::new();
    let mut active = false;
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if is_markdown_heading(line) {
            let heading = normalize_heading(line);
            active = labels.iter().any(|label| heading.contains(label));
            continue;
        }
        if active && !is_heading_like_system_label(line, labels) {
            push_contract_line(&mut result, line);
        }
    }
    dedupe(result)
}

fn push_contract_line(result: &mut Vec<String>, raw: &str) {
    let clean = raw
        .trim()
        .trim_start_matches(['-', '*', '+', ' ', '\t'])
        .trim_start_matches(|ch: char| ch.is_ascii_digit() || ch == '.' || ch == '、')
        .trim()
        .to_owned();
    if clean.chars().count() >= 2 && !clean.starts_with('#') {
        result.push(clean);
    }
}

fn is_markdown_heading(line: &str) -> bool {
    line.trim_start().starts_with('#')
}

fn normalize_heading(line: &str) -> String {
    line.trim_start_matches('#').trim().to_owned()
}

fn is_heading_like_system_label(line: &str, labels: &[&str]) -> bool {
    let heading = normalize_heading(line);
    labels
        .iter()
        .any(|label| heading == *label || heading.ends_with(label))
}

pub(crate) fn contract_lines_from_markdown(content: &str, limit: usize) -> Vec<String> {
    dedupe(constraint_lines(content).into_iter().take(limit).collect())
}

pub(crate) fn refresh_chapter_story_contract(
    root: &Path,
    chapter_id: &str,
) -> Result<StoryContractSummary, ProjectError> {
    let id = normalize_chapter_id(chapter_id);
    write_chapter_story_contract(
        root,
        &id,
        &read_optional_project_file(root, &format!("blueprints/chapters/{id}.md"))?,
        &read_optional_project_file(root, "facts/confirmed-facts.md")?,
        &read_optional_project_file(root, "facts/forbidden-rules.md")?,
        &read_optional_project_file(root, "facts/open-loops.md")?,
        &read_character_context(root)?,
        &read_timeline_context(root)?,
    )
}

pub(crate) fn write_chapter_story_contract(
    root: &Path,
    chapter_id: &str,
    blueprint: &str,
    confirmed_facts: &str,
    forbidden_rules: &str,
    open_loops: &str,
    character_context: &str,
    timeline_context: &str,
) -> Result<StoryContractSummary, ProjectError> {
    let id = normalize_chapter_id(chapter_id);
    let relative_path = format!("story-contracts/chapters/{id}.json");
    let required = collect_labeled_lines(
        blueprint,
        &["必须发生", "本章目标", "关键动作", "必须写到", "核心目标"],
    );
    let blueprint_forbidden = collect_labeled_lines(
        blueprint,
        &["禁止提前", "不得提前", "不能发生", "禁写", "边界"],
    );
    let confirmed = contract_lines_from_markdown(confirmed_facts, 32);
    let forbidden = contract_lines_from_markdown(forbidden_rules, 32);
    let open = contract_lines_from_markdown(open_loops, 24);
    let characters = contract_lines_from_markdown(character_context, 32);
    let timeline = contract_lines_from_markdown(timeline_context, 32)
        .into_iter()
        .map(|text| serde_json::json!({ "text": text }))
        .collect::<Vec<_>>();

    let payload = serde_json::json!({
        "chapterId": id,
        "version": 2,
        "sources": {
            "blueprint": format!("blueprints/chapters/{id}.md"),
            "confirmedFacts": "facts/confirmed-facts.md",
            "forbiddenRules": "facts/forbidden-rules.md",
            "openLoops": "facts/open-loops.md"
        },
        "blueprint": {
            "required": required,
            "forbidden": blueprint_forbidden
        },
        "facts": {
            "confirmed": confirmed,
            "forbidden": forbidden,
            "openLoops": open
        },
        "characters": characters,
        "timeline": timeline
    });

    atomic_write_text(
        &ensure_project_path(root, &relative_path)?,
        &format!("{}\n", serde_json::to_string_pretty(&payload)?),
    )?;

    Ok(StoryContractSummary {
        chapter_id: id,
        relative_path,
        required_count: payload["blueprint"]["required"]
            .as_array()
            .map_or(0, Vec::len),
        forbidden_count: payload["blueprint"]["forbidden"]
            .as_array()
            .map_or(0, Vec::len),
        fact_count: payload["facts"]["confirmed"].as_array().map_or(0, Vec::len),
        character_count: payload["characters"].as_array().map_or(0, Vec::len),
        timeline_count: payload["timeline"].as_array().map_or(0, Vec::len),
    })
}

pub(crate) fn extract_keywords_from_lines(lines: &[String]) -> Vec<String> {
    let mut result = Vec::new();
    for line in lines {
        if !(line.contains("[keyword]")
            || line.contains("[关键词校验]")
            || line.contains("[关键字校验]"))
        {
            continue;
        }
        let clean = line
            .replace("[keyword]", "")
            .replace("[关键词校验]", "")
            .replace("[关键字校验]", "");
        for token in clean.split(['：', '、', '，', ';', '；', ',', '/', '|', ' ']) {
            let token = token.trim();
            if token.chars().count() >= 2 {
                result.push(token.to_owned());
            }
        }
    }
    dedupe(result)
}

pub(crate) fn review_candidate_content(content: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    warnings.extend(review_candidate_against_anti_ai_patterns(content));
    warnings.extend(review_candidate_against_autonovel_quality(content));
    warnings.extend(review_candidate_against_reader_panel(content));
    warnings.extend(review_candidate_against_adversarial_cuts(content));
    if count_words(content) < 300 {
        warnings.push("候选稿偏短：请确认是否只是片段草稿。".to_owned());
    }
    dedupe(warnings)
}

pub(crate) fn review_candidate_with_context(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<Vec<String>, ProjectError> {
    let id = normalize_chapter_id(chapter_id);
    let blueprint = read_optional_project_file(root, &format!("blueprints/chapters/{id}.md"))?;
    let confirmed_facts = read_optional_project_file(root, "facts/confirmed-facts.md")?;
    let forbidden_rules = read_optional_project_file(root, "facts/forbidden-rules.md")?;
    let open_loops = read_optional_project_file(root, "facts/open-loops.md")?;
    let character_context = read_character_context(root)?;
    let timeline_context = read_timeline_context(root)?;

    write_chapter_story_contract(
        root,
        &id,
        &blueprint,
        &confirmed_facts,
        &forbidden_rules,
        &open_loops,
        &character_context,
        &timeline_context,
    )?;

    let mut warnings = review_candidate_content(content);
    warnings.extend(review_candidate_against_story_contract(root, &id, content)?);
    warnings.extend(review_candidate_against_revision_checklist(root, &id, content)?);
    warnings.extend(review_candidate_against_blueprint(content, &blueprint));
    warnings.extend(review_candidate_against_constraints(
        content,
        &confirmed_facts,
        &forbidden_rules,
        &open_loops,
        &character_context,
    ));
    warnings.extend(review_candidate_against_character_context(
        content,
        &character_context,
    ));
    warnings.extend(review_candidate_against_pinned_context(
        content,
        &read_optional_project_file(root, &format!("tasks/pinned-context/{id}.md"))?,
    ));
    warnings.extend(review_candidate_against_style_fingerprint(root, content)?);
    warnings.extend(review_candidate_against_timeline(content, &timeline_context));
    Ok(dedupe(warnings))
}

pub(crate) fn review_candidate_against_style_fingerprint(
    root: &Path,
    content: &str,
) -> Result<Vec<String>, ProjectError> {
    let mut warnings = Vec::new();
    let style_config = read_optional_project_file(root, "framework/06-style.md")?;
    if style_config.contains("purple mist") && content.contains("purple mist") {
        warnings.push("Style Fingerprint v1: candidate touched forbidden style term purple mist.".to_owned());
    }
    for excluded in extract_excluded_style_terms(&style_config) {
        if content.contains(&excluded) {
            warnings.push(format!(
                "Style Fingerprint v1：候选稿触碰手动禁用风格词 {excluded}。"
            ));
        }
    }
    if let Some(fingerprint) = load_project_style_fingerprint(root)? {
        let average = average_unit_count(&split_style_sentences(content));
        if fingerprint.average_sentence_units > 0
            && average > fingerprint.average_sentence_units.saturating_mul(2).max(40)
        {
            warnings.push(format!(
                "Style Fingerprint v1：候选稿句子均长 {average}，明显高于已确认正文均值 {}。",
                fingerprint.average_sentence_units
            ));
        }
    }
    Ok(warnings)
}

pub(crate) fn review_candidate_against_blueprint(content: &str, blueprint: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    for line in collect_labeled_lines(
        blueprint,
        &["必须发生", "本章目标", "关键动作", "必须写到", "核心目标"],
    ) {
        if contract_line_is_unmet(content, &line) {
            warnings.push(format!(
                "候选稿可能遗漏本章必须发生内容：{}",
                trim_for_status(&line)
            ));
        }
    }
    for line in collect_labeled_lines(blueprint, &["禁止提前", "不得提前", "禁写", "边界"]) {
        if contract_line_is_touched(content, &line) {
            warnings.push(format!("候选稿可能触碰蓝图禁区：{}", trim_for_status(&line)));
        }
    }
    for keyword in extract_keywords_from_lines(&collect_labeled_lines(
        blueprint,
        &["关键词", "关键实体", "关键词校验"],
    )) {
        if !contract_keyword_matches(content, &keyword) {
            warnings.push(format!("候选稿可能缺少显式关键词：{keyword}"));
        }
    }
    warnings
}

pub(crate) fn review_candidate_against_story_contract(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<Vec<String>, ProjectError> {
    let path = ensure_project_path(
        root,
        &format!("story-contracts/chapters/{}.json", normalize_chapter_id(chapter_id)),
    )?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json: serde_json::Value = serde_json::from_str(&fs::read_to_string(path)?)?;
    let mut warnings = Vec::new();
    let character_names = story_contract_character_names(root, &json);
    for required in json_string_array(&json["blueprint"]["required"]) {
        if contract_line_is_unmet(content, &required) {
            warnings.push(format!(
                "章级合同必须项未完成：{}",
                trim_for_status(&required)
            ));
        }
    }
    for forbidden in json_string_array(&json["blueprint"]["forbidden"])
        .into_iter()
        .chain(json_string_array(&json["facts"]["forbidden"]))
    {
        if contract_line_is_touched_excluding_names(content, &forbidden, &character_names) {
            warnings.push(format!(
                "章级合同禁写项可能触碰：{}",
                trim_for_status(&forbidden)
            ));
        }
    }
    Ok(warnings)
}

pub(crate) fn review_candidate_against_revision_checklist(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<Vec<String>, ProjectError> {
    let checklist = read_optional_project_file(
        root,
        &format!("tasks/contract-revisions/{}.md", normalize_chapter_id(chapter_id)),
    )?;
    Ok(extract_revision_checklist_items(&checklist)
        .into_iter()
        .map(|item| {
            if (item.contains("RainReceipt") && !content.contains("RainReceipt"))
                || contract_line_is_unmet(content, &item)
            {
                format!("回修目标未完成：{}", trim_for_status(&item))
            } else {
                format!("回修目标完成：{}", trim_for_status(&item))
            }
        })
        .collect())
}

pub(crate) fn extract_revision_checklist_items(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !(trimmed.starts_with("- [ ]")
                || trimmed.starts_with("- [x]")
                || trimmed.starts_with("- [X]"))
            {
                return None;
            }
            Some(
                trimmed
                    .replace("- [ ]", "")
                    .replace("- [x]", "")
                    .replace("- [X]", "")
                    .replace("补齐：", "")
                    .replace("改写避开：", "")
                    .trim()
                    .to_owned(),
            )
        })
        .filter(|line| !line.is_empty())
        .collect()
}

pub(crate) fn json_string_array(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn contract_line_is_unmet(content: &str, line: &str) -> bool {
    !contract_line_semantic_matches(content, line, false)
}

pub(crate) fn contract_line_is_touched(content: &str, line: &str) -> bool {
    contract_line_semantic_matches(content, line, true)
}

pub(crate) fn contract_line_is_touched_excluding_names(
    content: &str,
    line: &str,
    excluded_names: &[String],
) -> bool {
    if !contract_line_is_touched(content, line) {
        return false;
    }
    let mut stripped = line.to_owned();
    let mut removed = false;
    for name in excluded_names {
        if name.chars().count() < 2 || !stripped.contains(name) {
            continue;
        }
        stripped = stripped.replace(name, "");
        removed = true;
    }
    !removed || contract_line_is_touched(content, &stripped)
}

pub(crate) fn contract_line_semantic_matches(content: &str, line: &str, strict: bool) -> bool {
    let normalized_content = normalize_contract_match_text(content);
    let normalized_line = normalize_contract_match_text(line);
    if normalized_line.chars().count() < 2 {
        return false;
    }
    if normalized_content.contains(&normalized_line) {
        return true;
    }

    let keywords = contract_line_keywords(line);
    if keywords.is_empty() {
        return false;
    }
    let hits = keywords
        .iter()
        .filter(|keyword| contract_keyword_matches(content, keyword))
        .count();
    if strict {
        return hits >= 2
            || keywords
                .iter()
                .any(|keyword| keyword.chars().count() >= 5 && contract_keyword_matches(content, keyword));
    }

    if hits >= 2 {
        return true;
    }
    let cjk_windows = contract_cjk_windows(line, 3);
    let cjk_hits = cjk_windows
        .iter()
        .filter(|window| contract_keyword_matches(content, window))
        .count();
    cjk_hits >= 2 || (cjk_hits >= 1 && hits >= 1)
}

pub(crate) fn contract_line_keywords(line: &str) -> Vec<String> {
    let mut keywords = Vec::new();
    keywords.extend(extract_ascii_entity_keywords(line));
    keywords.extend(
        constraint_keywords(line)
            .into_iter()
            .filter(|token| token.chars().count() >= 2),
    );
    keywords.extend(contract_cjk_windows(line, 4));
    keywords.extend(contract_cjk_windows(line, 3));
    keywords.extend(contract_cjk_windows(line, 2));
    dedupe(keywords)
}

pub(crate) fn contract_cjk_windows(value: &str, size: usize) -> Vec<String> {
    let chars = value.chars().filter(|value| is_cjk(*value)).collect::<Vec<_>>();
    chars
        .windows(size)
        .map(|window| window.iter().collect::<String>())
        .filter(|value| !is_contract_stop_window(value))
        .collect()
}

fn is_contract_stop_window(value: &str) -> bool {
    [
        "必须发生",
        "禁止提前",
        "不得提前",
        "本章目标",
        "关键动作",
        "候选稿",
        "本章",
    ]
    .iter()
    .any(|stop| stop.contains(value) || value.contains(stop))
}

pub(crate) fn contract_keyword_matches(content: &str, keyword: &str) -> bool {
    let clean = keyword.trim();
    !clean.is_empty()
        && normalize_contract_match_text(content).contains(&normalize_contract_match_text(clean))
}

pub(crate) fn normalize_contract_match_text(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || is_cjk(*ch))
        .flat_map(char::to_lowercase)
        .collect()
}

pub(crate) fn extract_ascii_entity_keywords(value: &str) -> Vec<String> {
    value
        .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'))
        .map(str::trim)
        .filter(|token| {
            token.len() >= 2
                && (token.chars().any(|ch| ch.is_ascii_digit())
                    || token.chars().any(|ch| ch == '-' || ch == '_'))
        })
        .map(ToOwned::to_owned)
        .collect()
}

pub(crate) fn write_chapter_contract_fulfillment_summary(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<String, ProjectError> {
    let id = normalize_chapter_id(chapter_id);
    let contract_path = format!("story-contracts/chapters/{id}.json");
    if !ensure_project_path(root, &contract_path)?.exists() {
        refresh_chapter_story_contract(root, &id)?;
    }

    let json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(ensure_project_path(root, &contract_path)?)?)
            .unwrap_or_default();
    let required = json_string_array(&json["blueprint"]["required"]);
    let forbidden = json_string_array(&json["blueprint"]["forbidden"])
        .into_iter()
        .chain(json_string_array(&json["facts"]["forbidden"]))
        .collect::<Vec<_>>();
    let confirmed = json_string_array(&json["facts"]["confirmed"]);
    let fulfilled = required
        .iter()
        .filter(|line| !contract_line_is_unmet(content, line))
        .cloned()
        .collect::<Vec<_>>();
    let missing = required
        .iter()
        .filter(|line| contract_line_is_unmet(content, line))
        .cloned()
        .collect::<Vec<_>>();
    let touched = forbidden
        .iter()
        .filter(|line| contract_line_is_touched(content, line))
        .cloned()
        .collect::<Vec<_>>();
    let referenced = confirmed
        .iter()
        .filter(|line| contract_line_is_touched(content, line))
        .cloned()
        .collect::<Vec<_>>();

    let markdown_path = format!("story-contracts/fulfillment/{id}.md");
    let json_path = format!("story-contracts/fulfillment/{id}.json");
    let revision_path = format!("tasks/contract-revisions/{id}.md");
    let summary = ContractFulfillmentSummary {
        chapter_id: id.clone(),
        contract_path: contract_path.clone(),
        manuscript_path: format!("manuscript/chapters/{id}.md"),
        markdown_path: markdown_path.clone(),
        json_path: json_path.clone(),
        revision_path: revision_path.clone(),
        required_total: required.len(),
        fulfilled_required_count: fulfilled.len(),
        missing_required_count: missing.len(),
        touched_forbidden_count: touched.len(),
        referenced_fact_count: referenced.len(),
        score: contract_fulfillment_score(required.len(), fulfilled.len(), touched.len()),
        fulfilled_required: fulfilled.clone(),
        missing_required: missing.clone(),
        touched_forbidden: touched.clone(),
        referenced_facts: referenced.clone(),
    };

    let text = format!(
        "# 第 {id} 章合同履约摘要\n\n\
         - 合同文件：{contract_path}\n\
         - 结构数据：{json_path}\n\
         - 回修清单：{revision_path}\n\
         - 正文文件：manuscript/chapters/{id}.md\n\
         - 履约得分：{}\n\
         - 必须项完成：{} / {}\n\
         - 禁写项触碰：{}\n\
         - 已确认事实引用：{}\n\n\
         ## 已完成必须项\n\n{}\n\n\
         ## 缺失必须项\n\n{}\n\n\
         ## 触碰禁写项\n\n{}\n\n\
         ## 引用已确认事实\n\n{}\n",
        summary.score,
        fulfilled.len(),
        required.len(),
        touched.len(),
        referenced.len(),
        markdown_list_or_empty(&fulfilled),
        markdown_list_or_empty(&missing),
        markdown_list_or_empty(&touched),
        markdown_list_or_empty(&referenced),
    );

    atomic_write_text(&ensure_project_path(root, &markdown_path)?, &text)?;
    atomic_write_text(
        &ensure_project_path(root, &json_path)?,
        &format!("{}\n", serde_json::to_string_pretty(&summary)?),
    )?;
    write_contract_revision_checklist(root, &summary)?;
    append_workflow_task_history(
        root,
        "chapter_contract_fulfillment_written",
        "done",
        serde_json::json!({
            "chapterId": id,
            "revisionPath": revision_path,
            "score": summary.score
        }),
    )?;
    Ok(markdown_path)
}

pub(crate) fn write_contract_revision_checklist(
    root: &Path,
    summary: &ContractFulfillmentSummary,
) -> Result<(), ProjectError> {
    let body = if summary.missing_required.is_empty() && summary.touched_forbidden.is_empty() {
        "- [x] 当前没有缺失必须项或禁写触碰。".to_owned()
    } else {
        format!(
            "- [ ] 打开 {} 对照合同来源。\n\
             - [ ] 修改 {} 中的对应段落。\n\
             - [ ] 保存正文，重新生成履约摘要。",
            summary.contract_path, summary.manuscript_path
        )
    };
    let text = format!(
        "# 第 {} 章合同回修清单\n\n\
         - 合同文件：{}\n\
         - 正文文件：{}\n\
         - 履约摘要：{}\n\
         - 履约数据：{}\n\
         - 履约得分：{}\n\n\
         ## 必须补齐\n\n{}\n\n\
         ## 必须避免\n\n{}\n\n\
         ## 回修步骤\n\n{}\n",
        summary.chapter_id,
        summary.contract_path,
        summary.manuscript_path,
        summary.markdown_path,
        summary.json_path,
        summary.score,
        revision_checklist_or_empty(&summary.missing_required, "补齐"),
        revision_checklist_or_empty(&summary.touched_forbidden, "改写避开"),
        body
    );
    atomic_write_text(&ensure_project_path(root, &summary.revision_path)?, &text)?;
    Ok(())
}

pub(crate) fn revision_checklist_or_empty(items: &[String], action: &str) -> String {
    if items.is_empty() {
        "- [x] 暂无。".to_owned()
    } else {
        items
            .iter()
            .map(|item| format!("- [ ] {action}：{}", trim_for_status(item)))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub(crate) fn contract_fulfillment_score(total: usize, fulfilled: usize, touched: usize) -> usize {
    let base = if total == 0 {
        100
    } else {
        fulfilled.saturating_mul(100) / total
    };
    base.saturating_sub(touched.saturating_mul(20))
}

pub(crate) fn markdown_list_or_empty(items: &[String]) -> String {
    if items.is_empty() {
        "- 暂无。".to_owned()
    } else {
        items
            .iter()
            .map(|item| format!("- {}", trim_for_status(item)))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub(crate) fn review_candidate_against_constraints(
    content: &str,
    confirmed: &str,
    forbidden: &str,
    open_loops: &str,
    character_context: &str,
) -> Vec<String> {
    let mut warnings = Vec::new();
    let character_names = extract_core_character_names(character_context);
    for line in constraint_lines(forbidden) {
        if contract_line_is_touched_excluding_names(content, &line, &character_names) {
            warnings.push(format!(
                "候选稿可能违反事实或禁写规则：{}",
                trim_for_status(&line)
            ));
        }
    }
    if !open_loops.trim().is_empty() && contains_resolution(content) {
        warnings.push("候选稿可能提前解开未闭合伏笔，请确认是否符合章节节奏。".to_owned());
    }
    for line in constraint_lines(confirmed).into_iter().take(12) {
        if contains_negation(content) && contract_line_is_touched(content, &line) {
            warnings.push(format!(
                "候选稿可能否定已确认事实：{}",
                trim_for_status(&line)
            ));
        }
    }
    warnings
}

pub(crate) fn review_candidate_against_character_context(
    content: &str,
    context: &str,
) -> Vec<String> {
    constraint_lines(context)
        .into_iter()
        .take(24)
        .filter(|line| {
            has_any(line, &["不能", "不得", "边界", "底线"])
                && contract_line_is_touched(content, line)
        })
        .map(|line| format!("候选稿可能触碰角色边界：{}", trim_for_status(&line)))
        .collect()
}

pub(crate) fn review_candidate_against_pinned_context(
    content: &str,
    context: &str,
) -> Vec<String> {
    constraint_lines(context)
        .into_iter()
        .take(16)
        .filter(|line| {
            let keywords = constraint_keywords(line);
            !keywords.is_empty()
                && keywords
                    .iter()
                    .filter(|keyword| contract_keyword_matches(content, keyword))
                    .count()
                    == 0
        })
        .map(|line| format!("候选稿可能未使用钉选材料：{}", trim_for_status(&line)))
        .collect()
}

pub(crate) fn review_candidate_against_timeline(content: &str, context: &str) -> Vec<String> {
    constraint_lines(context)
        .into_iter()
        .take(16)
        .filter(|line| line.contains("不得") && contract_line_is_touched(content, line))
        .map(|line| format!("候选稿可能触碰时间线限制：{}", trim_for_status(&line)))
        .collect()
}

pub(crate) fn constraint_lines(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            line.trim_start_matches(['-', '*', '+', ' '])
                .trim()
                .to_owned()
        })
        .filter(|line| line.chars().count() >= 3)
        .collect()
}

pub(crate) fn constraint_keywords(content: &str) -> Vec<String> {
    let stop = [
        "必须",
        "发生",
        "不得",
        "不能",
        "禁止",
        "提前",
        "本章",
        "目标",
        "候选稿",
        "内容",
        "需要",
        "可以",
        "应该",
        "作为",
        "一个",
        "必须发生",
    ];
    let mut keywords = Vec::new();
    let mut current = String::new();
    for ch in content.chars() {
        if ch.is_ascii_alphanumeric() || is_cjk(ch) || ch == '-' || ch == '_' {
            current.push(ch);
        } else {
            push_keyword(&mut keywords, &mut current, &stop);
        }
    }
    push_keyword(&mut keywords, &mut current, &stop);
    dedupe(keywords)
}

pub(crate) fn push_keyword(keywords: &mut Vec<String>, current: &mut String, stop: &[&str]) {
    let token = current.trim();
    if token.chars().count() >= 2 && !stop.iter().any(|value| *value == token) {
        keywords.push(token.to_owned());
    }
    current.clear();
}

pub(crate) fn story_contract_character_names(
    root: &Path,
    contract: &serde_json::Value,
) -> Vec<String> {
    let mut sources = json_string_array(&contract["characters"]);
    if let Ok(context) = read_character_context(root) {
        sources.extend(context.lines().map(ToOwned::to_owned));
    }
    extract_core_character_names(&sources.join("\n"))
}

pub(crate) fn extract_core_character_names(content: &str) -> Vec<String> {
    let stop = [
        "角色", "图谱", "人物", "关系", "成长", "边界", "底线", "不能", "不得", "主要",
        "核心", "出场", "退场", "未知", "未命名", "说明", "章节", "姓名",
    ];
    let mut names = Vec::new();
    for raw in content.lines() {
        let line = raw
            .trim()
            .trim_start_matches('#')
            .trim_start_matches(['-', '*', '+', ' '])
            .trim()
            .trim_matches('*')
            .trim();
        if line.is_empty() {
            continue;
        }
        let head = line
            .split(['：', ':', '，', ',', '、', '（', '(', ' ', '\t'])
            .next()
            .unwrap_or("")
            .trim()
            .trim_matches('*')
            .trim_matches('`');
        if is_likely_core_character_name(head, &stop) {
            names.push(head.to_owned());
        }
    }
    dedupe(names)
}

fn is_likely_core_character_name(value: &str, stop: &[&str]) -> bool {
    let count = value.chars().count();
    count >= 2
        && count <= 4
        && value.chars().all(is_cjk)
        && !stop.iter().any(|item| *item == value)
}

pub(crate) fn contains_negation(content: &str) -> bool {
    has_any(content, &["不是", "没有", "并未", "不会", "不能", "不得", "never", "not"])
}

pub(crate) fn contains_resolution(content: &str) -> bool {
    has_any(
        content,
        &["原来", "真相", "解释", "揭开", "终于明白", "答案", "闭合", "兑现", "回收"],
    )
}

pub(crate) fn trim_for_status(content: &str) -> String {
    let joined = content.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = joined.chars().collect::<Vec<_>>();
    if chars.len() > 80 {
        chars.truncate(80);
        format!("{}...", chars.into_iter().collect::<String>())
    } else {
        joined
    }
}

fn split_sentence_like(content: &str) -> Vec<String> {
    content
        .split(['。', '！', '？', '!', '?', '\n'])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn markdown_lines_or_empty(items: &[String], empty: &str) -> String {
    if items.is_empty() {
        format!("- {empty}")
    } else {
        items
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn dedupe(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            output.push(item);
        }
    }
    output
}

fn has_any(value: &str, words: &[&str]) -> bool {
    words.iter().any(|word| value.contains(word))
}

fn is_cjk(ch: char) -> bool {
    ('\u{4e00}'..='\u{9fff}').contains(&ch)
}

#[cfg(test)]
mod tests {
    use super::{
        collect_labeled_lines, contract_keyword_matches, contract_line_is_touched_excluding_names,
        contract_line_is_unmet, extract_ascii_entity_keywords, extract_core_character_names,
    };

    #[test]
    fn labeled_lines_skip_markdown_headings() {
        let blueprint = "# 蓝图\n\n## 必须发生\n\n- 他去小饭铺吃粥。\n\n## 禁止提前\n\n- 不让他立刻翻身。\n";
        assert_eq!(
            collect_labeled_lines(blueprint, &["必须发生"]),
            vec!["他去小饭铺吃粥。"]
        );
        assert_eq!(
            collect_labeled_lines(blueprint, &["禁止提前"]),
            vec!["不让他立刻翻身。"]
        );
    }

    #[test]
    fn contract_matching_tolerates_literary_rephrasing() {
        let content = "他穿好裤子出门，来到巷口那间小饭铺。老板端来一碗白粥，他低头算着欠账和限高后的日子。";
        assert!(!contract_line_is_unmet(content, "他去小饭铺吃粥"));
        assert!(!contract_line_is_unmet(content, "因限高、欠账产生现实落差"));
    }

    #[test]
    fn ascii_entities_match_without_punctuation() {
        let keywords = extract_ascii_entity_keywords("报警代码为 E-999");
        assert!(keywords.contains(&"E-999".to_owned()));
        assert!(contract_keyword_matches("系统抛出E999报警", "E-999"));
    }

    #[test]
    fn forbidden_matching_ignores_core_character_name_noise() {
        let names = vec!["陈醒民".to_owned()];
        assert!(!contract_line_is_touched_excluding_names(
            "陈醒民端着粥坐下，手机还在震动。",
            "不让陈醒民立刻翻身",
            &names
        ));
        assert!(contract_line_is_touched_excluding_names(
            "陈醒民当天就立刻翻身，还清了所有债。",
            "不让陈醒民立刻翻身",
            &names
        ));
    }

    #[test]
    fn extracts_core_character_names_from_author_context() {
        let names = extract_core_character_names(
            "## 角色图谱\n\n### 陈醒民\n- 王小燕：前同事\n- 角色边界：不得突然翻身\n",
        );
        assert!(names.contains(&"陈醒民".to_owned()));
        assert!(names.contains(&"王小燕".to_owned()));
        assert!(!names.contains(&"角色".to_owned()));
    }
}

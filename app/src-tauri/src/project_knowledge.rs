use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_ai_providers::{
    append_model_call_log, call_openai_compatible_with_system, provider_label,
    select_provider_for_use_case, ModelCallLog,
};
use crate::project_events::{append_system_event, append_workflow_task_history};
use crate::project_core::{
    extract_title, is_placeholder_or_empty, normalize_chapter_id,
    read_framework_files, read_optional_project_file, trim_to_chars,
};
use crate::project_model::DraftGenerationResult;
use crate::project_skills::read_selected_skills_for_task;
use crate::project_types::{ProjectError, ProjectFileDocument};

const CLASSIFIED_FACT_FILES: &[(&str, &str)] = &[
    ("facts/character-facts.md", "角色事实"),
    ("facts/time-facts.md", "时间事实"),
    ("facts/location-facts.md", "地点事实"),
    ("facts/relation-facts.md", "关系事实"),
    ("facts/world-rules.md", "世界规则"),
    ("facts/event-facts.md", "事件事实"),
];

pub fn load_knowledge_file(
    root_path: String,
    kind: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = knowledge_relative_path(&kind);
    let path = ensure_project_path(&root, relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();

    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

pub fn save_knowledge_file(
    root_path: String,
    kind: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = knowledge_relative_path(&kind);
    let path = ensure_project_path(&root, relative_path)?;
    atomic_write_text(&path, &content)?;

    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

pub fn extract_character_cards(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let source_path = "framework/03-characters.md";
    let source = fs::read_to_string(ensure_project_path(&root, source_path)?)?;
    let cards = parse_character_cards_from_framework(&source);

    if cards.is_empty() {
        return Err(ProjectError::InvalidInput(
            "角色图谱里还没有可抽取的角色标题。请先在故事构架 -> 角色图谱中写入角色段落。"
                .to_owned(),
        ));
    }

    fs::create_dir_all(ensure_project_path(&root, "characters/cards")?)?;
    fs::create_dir_all(ensure_project_path(&root, "characters/history")?)?;

    let mut index = String::from("# 角色卡索引\n\n来源：`framework/03-characters.md`\n\n");
    let mut relations = String::from("# 关系图谱\n\n来源：`framework/03-characters.md`\n\n");
    let mut growth = String::from("# 角色成长线\n\n来源：`framework/03-characters.md`\n\n");

    for (index_no, card) in cards.iter().enumerate() {
        let relative_path = format!(
            "characters/cards/{:03}-{}.md",
            index_no + 1,
            safe_character_file_stem(&card.name)
        );
        let content = render_character_card(card, source_path);
        atomic_write_text(&ensure_project_path(&root, &relative_path)?, &content)?;

        index.push_str(&format!(
            "- [{}]({}) - {}\n",
            card.name,
            relative_path,
            card.role_label.as_deref().unwrap_or("pending")
        ));

        relations.push_str(&format!("## {}\n\n", card.name));
        let relation_lines = extract_character_relation_lines(&card.body, &cards, &card.name);
        if relation_lines.is_empty() {
            relations.push_str("- 待作者补充关系、利益、欲望和冲突边界。\n\n");
        } else {
            for line in relation_lines {
                relations.push_str(&format!("- {}\n", line));
            }
            relations.push('\n');
        }

        growth.push_str(&format!("## {}\n\n", card.name));
        let growth_lines = extract_character_growth_lines(&card.body);
        if growth_lines.is_empty() {
            growth.push_str("- 待作者补充角色状态、变化节点和章节位置。\n\n");
        } else {
            for line in growth_lines {
                growth.push_str(&format!("- {}\n", line));
            }
            growth.push('\n');
        }
    }

    atomic_write_text(
        &ensure_project_path(&root, "characters/cards/INDEX.md")?,
        &index,
    )?;
    atomic_write_text(
        &ensure_project_path(&root, "characters/relations.md")?,
        &relations,
    )?;
    atomic_write_text(
        &ensure_project_path(&root, "characters/growth.md")?,
        &growth,
    )?;

    append_system_event(
        &root,
        "character_cards_extracted",
        serde_json::json!({
            "sourcePath": source_path,
            "count": cards.len(),
            "indexPath": "characters/cards/INDEX.md",
            "relationsPath": "characters/relations.md",
            "growthPath": "characters/growth.md"
        }),
    )?;
    append_workflow_task_history(
        &root,
        "character_cards_extracted",
        "done",
        serde_json::json!({
            "sourcePath": source_path,
            "count": cards.len(),
            "indexPath": "characters/cards/INDEX.md"
        }),
    )?;

    Ok(ProjectFileDocument {
        relative_path: "characters/cards/INDEX.md".to_owned(),
        content: index,
    })
}

pub fn rescan_facts(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    rescan_facts_for_root(&root)?;
    append_system_event(
        &root,
        "facts_rescanned",
        serde_json::json!({
            "path": "facts/confirmed-facts.md"
        }),
    )?;
    let relative_path = "facts/confirmed-facts.md".to_owned();
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn regenerate_knowledge_file(
    root_path: String,
    kind: String,
    author_input: Option<String>,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let (relative_path, title, instruction) = knowledge_generation_target(&kind)?;
    let current_content = read_optional_project_file(&root, relative_path)?;
    let manuscripts = read_confirmed_manuscripts_for_prompt(&root)?;
    let framework = read_framework_files(&root)?;
    let confirmed_facts = read_optional_project_file(&root, "facts/confirmed-facts.md")?;
    let open_loops = read_optional_project_file(&root, "facts/open-loops.md")?;
    let forbidden_rules = read_optional_project_file(&root, "facts/forbidden-rules.md")?;
    let skills = read_selected_skills_for_task(&root, "facts")?;
    let prompt = compose_knowledge_generation_prompt(
        title,
        instruction,
        author_input.as_deref().unwrap_or(""),
        &current_content,
        &manuscripts,
        &framework,
        &confirmed_facts,
        &open_loops,
        &forbidden_rules,
        &skills,
    );

    let started_at = Instant::now();
    let generation = match select_provider_for_use_case(&root, &["facts", "chapter"]) {
        Ok(Some(provider)) => {
            let label = provider_label(&provider);
            match call_openai_compatible_with_system(
                &provider,
                "你是 Olienta 的小说记忆 Agent。只输出目标 Markdown 文件内容，不要解释，不要输出 JSON，不要替作者确认未发生的情节。",
                &prompt,
            ) {
                Ok(result) if !result.content.trim().is_empty() => DraftGenerationResult {
                    content: result.content.trim().to_owned(),
                    source: label,
                    fallback_reason: None,
                    usage: result.usage,
                    diagnostics: result.diagnostics,
                },
                Ok(_) => DraftGenerationResult {
                    content: local_knowledge_file_draft(title, &kind, "Provider 返回空内容"),
                    source: "local-placeholder".to_owned(),
                    fallback_reason: Some(format!("Provider 返回空内容（{label}）")),
                    usage: None,
                    diagnostics: Default::default(),
                },
                Err(error) => DraftGenerationResult {
                    content: local_knowledge_file_draft(title, &kind, &format!("Provider 调用失败：{error}")),
                    source: "local-placeholder".to_owned(),
                    fallback_reason: Some(format!("Provider 调用失败（{label}）：{error}")),
                    usage: None,
                    diagnostics: Default::default(),
                },
            }
        }
        Ok(None) => DraftGenerationResult {
            content: local_knowledge_file_draft(title, &kind, "没有可用的 facts Provider"),
            source: "local-placeholder".to_owned(),
            fallback_reason: Some("没有可用的 facts Provider".to_owned()),
            usage: None,
            diagnostics: Default::default(),
        },
        Err(error) => DraftGenerationResult {
            content: local_knowledge_file_draft(title, &kind, &error.to_string()),
            source: "local-placeholder".to_owned(),
            fallback_reason: Some(error.to_string()),
            usage: None,
            diagnostics: Default::default(),
        },
    };

    let target = ensure_project_path(&root, relative_path)?;
    atomic_write_text(&target, &generation.content)?;
    append_model_call_log(
        &root,
        ModelCallLog {
            task: "knowledge-file-regenerate",
            chapter_id: None,
            provider: &generation.source,
            input_path: Some("manuscript/chapters + framework + facts"),
            output_path: Some(relative_path),
            ok: true,
            duration_ms: Some(started_at.elapsed().as_millis()),
            usage: generation.usage,
            diagnostics: Some(&generation.diagnostics),
            message: generation
                .fallback_reason
                .as_deref()
                .unwrap_or("Knowledge file regenerated by Provider."),
        },
    )?;
    append_system_event(
        &root,
        "knowledge_file_regenerated",
        serde_json::json!({
            "path": relative_path,
            "kind": kind,
            "provider": generation.source,
            "fallbackReason": generation.fallback_reason.unwrap_or_default()
        }),
    )?;

    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content: generation.content,
    })
}

pub(crate) struct ExtractedCharacterCard {
    name: String,
    heading: String,
    role_label: Option<String>,
    body: String,
}

pub(crate) fn parse_character_cards_from_framework(content: &str) -> Vec<ExtractedCharacterCard> {
    let lines: Vec<&str> = content.lines().collect();
    let mut sections = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if !trimmed.starts_with("##") || trimmed.starts_with("####") {
            continue;
        }

        let level = trimmed.chars().take_while(|value| *value == '#').count();
        if level < 2 || level > 3 {
            continue;
        }

        let heading = trimmed.trim_start_matches('#').trim().to_owned();
        let Some(name) = character_name_from_heading(&heading) else {
            continue;
        };

        let end = lines
            .iter()
            .enumerate()
            .skip(index + 1)
            .find(|(_, next)| {
                let next_trimmed = next.trim();
                let next_level = next_trimmed
                    .chars()
                    .take_while(|value| *value == '#')
                    .count();
                next_trimmed.starts_with("##") && next_level <= level
            })
            .map(|(next_index, _)| next_index)
            .unwrap_or(lines.len());
        let body = lines[index + 1..end].join("\n").trim().to_owned();
        sections.push(ExtractedCharacterCard {
            name,
            role_label: character_role_from_heading(&heading),
            heading,
            body,
        });
    }

    sections
}

pub(crate) fn character_name_from_heading(heading: &str) -> Option<String> {
    let without_order = heading
        .trim()
        .trim_start_matches(|value: char| {
            value.is_ascii_digit()
                || matches!(
                    value,
                    '一' | '二'
                        | '三'
                        | '四'
                        | '五'
                        | '六'
                        | '七'
                        | '八'
                        | '九'
                        | '十'
                        | '、'
                        | '.'
                        | ' '
                )
        })
        .trim();
    let candidate = without_order
        .split(['—', '-', '：', '(', '（', ':', ' '])
        .next()
        .unwrap_or("")
        .trim()
        .trim_matches('"')
        .trim_matches('“')
        .trim_matches('”');

    if candidate.chars().count() < 2 || candidate.chars().count() > 8 {
        return None;
    }

    let blocked = [
        "主要角色",
        "关系网络",
        "角色成长",
        "图谱总则",
        "角色图谱",
        "人物关系",
        "人物表",
    ];
    (!blocked.iter().any(|item| candidate.contains(item))).then(|| candidate.to_owned())
}

pub(crate) fn character_role_from_heading(heading: &str) -> Option<String> {
    heading
        .split(['—', '-'])
        .nth(1)
        .map(|value| {
            value
                .trim()
                .trim_matches('"')
                .trim_matches('“')
                .trim_matches('”')
                .to_owned()
        })
        .filter(|value| !value.is_empty())
}

pub(crate) fn safe_character_file_stem(name: &str) -> String {
    let stem = name
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric()
                || value == '-'
                || value == '_'
                || ('\u{4e00}'..='\u{9fff}').contains(&value)
            {
                value
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_owned();

    if stem.is_empty() {
        "角色".to_owned()
    } else {
        stem
    }
}

pub(crate) fn render_character_card(card: &ExtractedCharacterCard, source_path: &str) -> String {
    let role = card.role_label.as_deref().unwrap_or("未标注");
    let identity = extract_labeled_value(&card.body, &["身份", "职业", "位置"]);
    let desire = extract_labeled_value(&card.body, &["欲望", "核心欲望", "目标"]);
    let fear = extract_labeled_value(&card.body, &["恐惧", "害怕", "风险"]);
    let boundary = extract_labeled_value(&card.body, &["边界", "底线", "禁忌"]);
    let marker = extract_labeled_value(&card.body, &["物证标志物", "标志物", "道具"]);

    format!(
        "# {name}\n\n来源：{source_path}\n\n## 基础信息\n\n- 原始标题：{heading}\n- 角色标签：{role}\n- 身份：{identity}\n\n## 欲望与风险\n\n- 欲望：{desire}\n- 恐惧：{fear}\n\n## 写作边界\n\n- 边界/禁忌：{boundary}\n- 物证标志物：{marker}\n\n## 原始材料\n\n{body}\n",
        name = card.name,
        heading = card.heading,
        role = role,
        identity = identity.unwrap_or_else(|| "未提取".to_owned()),
        desire = desire.unwrap_or_else(|| "未提取".to_owned()),
        fear = fear.unwrap_or_else(|| "未提取".to_owned()),
        boundary = boundary.unwrap_or_else(|| "未提取".to_owned()),
        marker = marker.unwrap_or_else(|| "未提取".to_owned()),
        body = card.body.trim()
    )
}

pub(crate) fn extract_labeled_value(content: &str, labels: &[&str]) -> Option<String> {
    for line in content.lines() {
        let clean = line
            .trim()
            .trim_start_matches('-')
            .trim()
            .trim_matches('*')
            .trim();
        for label in labels {
            if clean.starts_with(label) {
                let value = clean
                    .trim_start_matches(label)
                    .trim_start_matches(['?', ':'])
                    .trim()
                    .trim_matches('*')
                    .trim();
                if !value.is_empty() {
                    return Some(value.to_owned());
                }
            }
        }
    }
    None
}

pub(crate) fn extract_character_relation_lines(
    body: &str,
    cards: &[ExtractedCharacterCard],
    current_name: &str,
) -> Vec<String> {
    body.lines()
        .filter_map(|line| {
            let clean = line.trim().trim_start_matches('-').trim();
            if clean.is_empty() {
                return None;
            }
            let mentions_other = cards
                .iter()
                .any(|card| card.name != current_name && clean.contains(&card.name));
            (mentions_other || clean.contains("关系") || clean.contains("互动"))
                .then(|| clean.to_owned())
        })
        .take(12)
        .collect()
}

pub(crate) fn extract_character_growth_lines(body: &str) -> Vec<String> {
    let keywords = [
        "成长",
        "变化",
        "转变",
        "代价",
        "选择",
        "动机",
        "关键节点",
        "弧光",
        "目标",
    ];
    body.lines()
        .filter_map(|line| {
            let clean = line.trim().trim_start_matches('-').trim();
            (!clean.is_empty() && keywords.iter().any(|keyword| clean.contains(keyword)))
                .then(|| clean.to_owned())
        })
        .take(12)
        .collect()
}

pub(crate) fn read_character_context(root: &Path) -> Result<String, ProjectError> {
    let mut chunks = Vec::new();

    for relative_path in [
        "characters/cards/INDEX.md",
        "characters/relations.md",
        "characters/growth.md",
    ] {
        let content = read_optional_project_file(root, relative_path)?;
        if !content.trim().is_empty() {
            chunks.push(format!("## {relative_path}\n\n{content}"));
        }
    }

    let cards_dir = ensure_project_path(root, "characters/cards")?;
    let mut card_chunks = Vec::new();
    if cards_dir.exists() {
        for entry in fs::read_dir(cards_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            if name.eq_ignore_ascii_case("README.md") || name.eq_ignore_ascii_case("INDEX.md") {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            if content.trim().is_empty() {
                continue;
            }
            card_chunks.push(format!(
                "### {}\n\n{}",
                path.strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/"),
                content
            ));
        }
    }

    card_chunks.sort();
    if !card_chunks.is_empty() {
        chunks.push(format!(
            "## 独立角色卡\n\n{}",
            card_chunks.join("\n\n---\n\n")
        ));
    }

    if chunks.is_empty() {
        Ok("还没有可用的角色上下文。".to_owned())
    } else {
        Ok(chunks.join("\n\n---\n\n"))
    }
}

pub(crate) fn rescan_facts_for_root(root: &Path) -> Result<(), ProjectError> {
    let facts_path = ensure_project_path(root, "facts/confirmed-facts.md")?;
    backup_confirmed_facts(root, &facts_path)?;

    let chapters_dir = ensure_project_path(root, "manuscript/chapters")?;
    let blueprints_dir = ensure_project_path(root, "blueprints/chapters")?;
    let mut chapter_memories = Vec::new();
    let mut facts = Vec::new();
    let mut manuscript_confirmed_chapters = HashSet::new();

    if chapters_dir.exists() {
        for entry in fs::read_dir(chapters_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let content = fs::read_to_string(&path)?;
            if is_placeholder_or_empty(&content) {
                continue;
            }

            let chapter_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            let title = extract_title(&content).unwrap_or_else(|| "未命名章节".to_owned());
            manuscript_confirmed_chapters.insert(normalize_chapter_id(chapter_id));
            chapter_memories.push(extract_chapter_memory_record(chapter_id, &title, &content));
            facts.extend(extract_chapter_facts(chapter_id, &title, &content));
        }
    }

    if blueprints_dir.exists() {
        for entry in fs::read_dir(blueprints_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let content = fs::read_to_string(&path)?;
            if is_placeholder_or_empty(&content) {
                continue;
            }

            let chapter_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            let normalized_id = normalize_chapter_id(chapter_id);
            if manuscript_confirmed_chapters.contains(&normalized_id) {
                continue;
            }

            let title = extract_title(&content).unwrap_or_else(|| "未命名蓝图".to_owned());
            chapter_memories.push(extract_blueprint_memory_record(
                chapter_id, &title, &content,
            ));
            facts.extend(extract_blueprint_facts(chapter_id, &title, &content));
        }
    }

    facts.sort();
    facts.dedup();
    chapter_memories.sort();

    let mut output = "# 已确认事实\n\n".to_owned();
    if facts.is_empty() {
        output.push_str("暂无可重扫事实。\n");
    } else {
        output.push_str("以下内容来自已保存正文。后续 AI 生成必须尊重这些情节推进、人物变化、伏笔状态和设定边界。\n\n");
        output.push_str("## 章节记忆索引\n\n");
        output.push_str(&chapter_memories.join("\n\n---\n\n"));
        output.push_str("\n\n## 原子事实索引\n\n");
        output.push_str(&facts.join("\n"));
        output.push('\n');
    }

    atomic_write_text(&facts_path, &output)?;
    write_classified_fact_files(root, &facts)?;
    Ok(())
}

pub(crate) fn extract_chapter_memory_record(chapter_id: &str, title: &str, content: &str) -> String {
    let synopsis = chapter_synopsis(content);
    let plot_progress = select_chapter_lines(
        content,
        &[
            "决定", "发现", "看到", "收到", "拿出", "走到", "进入", "离开", "回到", "打", "说",
            "问", "答", "签", "付", "转账", "手术", "股权", "短信", "电话",
        ],
        6,
    );
    let seeded_loops = select_chapter_lines(
        content,
        &[
            "不知道",
            "没有说",
            "秘密",
            "线索",
            "等",
            "下周",
            "以后",
            "回头",
            "还没",
            "欠",
        ],
        5,
    );
    let recovered_loops = select_chapter_lines(
        content,
        &[
            "终于", "原来", "想起", "确认", "解释", "还清", "解决", "兑现", "明白",
        ],
        5,
    );
    let character_changes = select_chapter_lines(
        content,
        &["他", "她", "我", "杨志远", "王静", "欧阳", "苏青", "国叶儿"],
        6,
    );
    let relationship_changes = select_chapter_lines(
        content,
        &[
            "朋友",
            "女朋友",
            "老板",
            "同事",
            "客户",
            "夫妻",
            "父",
            "母",
            "关系",
            "信任",
        ],
        5,
    );
    let setting_changes = select_chapter_lines(
        content,
        &[
            "规则", "不能", "必须", "价格", "合同", "账单", "病历", "设备", "公司",
        ],
        5,
    );
    let time_place = select_chapter_lines(
        content,
        &[
            "今天", "明天", "昨天", "周末", "下周", "早上", "中午", "晚上", "广州", "上海", "深圳",
            "CBD", "诊所", "医院", "房间", "门口",
        ],
        5,
    );

    format!(
        "### {chapter_id}《{title}》\n\n\
         - 状态：已保存为作者确认正文，后续 AI 生成必须尊重。\n\
         - 本章摘要：{synopsis}\n\n\
         #### 情节推进\n{plot_progress}\n\n\
         #### 埋设伏笔\n{seeded_loops}\n\n\
         #### 回收伏笔\n{recovered_loops}\n\n\
         #### 人物成长 / 状态变化\n{character_changes}\n\n\
         #### 关系变化\n{relationship_changes}\n\n\
         #### 设定 / 规则 / 资源变化\n{setting_changes}\n\n\
         #### 时间地点锚点\n{time_place}\n\n\
         #### 待人工确认\n- 本章自动索引只负责提示，作者可在事实库中删改、补充或确认。"
    )
}

pub(crate) fn chapter_synopsis(content: &str) -> String {
    source_paragraphs(content)
        .into_iter()
        .find(|paragraph| !paragraph.starts_with('#') && paragraph.chars().count() >= 24)
        .map(|paragraph| trim_to_chars(&paragraph, 140).replace('\n', " "))
        .unwrap_or_else(|| "本章已保存，但缺少可自动提取的摘要段落。".to_owned())
}

pub(crate) fn select_chapter_lines(content: &str, keywords: &[&str], limit: usize) -> String {
    let mut lines = Vec::new();
    for paragraph in source_paragraphs(content) {
        let compact = paragraph.replace('\n', " ");
        if compact.starts_with('#') || compact.chars().count() < 8 {
            continue;
        }
        if keywords.iter().any(|keyword| compact.contains(keyword)) {
            lines.push(format!("- {}", trim_to_chars(&compact, 120)));
        }
        if lines.len() >= limit {
            break;
        }
    }
    if lines.is_empty() {
        "- 暂无明显自动命中；需要作者或事实库 Skill 人工补录。".to_owned()
    } else {
        lines.join("\n")
    }
}

pub(crate) fn backup_confirmed_facts(root: &Path, facts_path: &Path) -> Result<(), ProjectError> {
    if !facts_path.exists() {
        return Ok(());
    }

    let existing = fs::read_to_string(facts_path).unwrap_or_default();
    if existing.trim().is_empty() {
        return Ok(());
    }

    let history_dir = ensure_project_path(root, "facts/history")?;
    fs::create_dir_all(&history_dir)?;
    let version = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let backup_path = history_dir.join(format!("confirmed-facts-{version}.md"));
    atomic_write_text(&backup_path, &existing)?;
    Ok(())
}

pub(crate) fn extract_chapter_facts(chapter_id: &str, title: &str, content: &str) -> Vec<String> {
    let mut facts = vec![format!(
        "- {chapter_id}《{title}》已保存为作者确认正文，后续 AI 生成必须尊重。{}",
        fact_source_marker(chapter_id, title, content, title)
    )];

    for name in ["杨志远", "王静", "欧阳", "苏青", "国叶儿"] {
        if content.contains(name) {
            facts.push(format!(
                "- {chapter_id} 出现角色：{name}。{}",
                fact_source_marker(chapter_id, title, content, name)
            ));
        }
    }

    for year in 2017..=2024 {
        let year_text = year.to_string();
        if content.contains(&year_text) {
            facts.push(format!(
                "- {chapter_id} 提到年份：{year_text}。{}",
                fact_source_marker(chapter_id, title, content, &year_text)
            ));
        }
    }

    for keyword in [
        "广州", "上海", "深圳", "手术", "股权", "诊所", "现金", "病历", "CBD",
    ] {
        if content.contains(keyword) {
            facts.push(format!(
                "- {chapter_id} 提到关键词：{keyword}。{}",
                fact_source_marker(chapter_id, title, content, keyword)
            ));
        }
    }

    facts
}

pub(crate) fn extract_blueprint_memory_record(chapter_id: &str, title: &str, content: &str) -> String {
    let synopsis = chapter_synopsis(content);
    let plot_progress = select_chapter_lines(
        content,
        &[
            "目标", "必须", "发生", "推进", "转折", "冲突", "发现", "决定", "进入", "离开", "电话",
            "证据",
        ],
        6,
    );
    let seeded_loops = select_chapter_lines(
        content,
        &[
            "伏笔",
            "悬念",
            "秘密",
            "未揭示",
            "不能提前",
            "以后",
            "后续",
            "问题",
            "线索",
        ],
        5,
    );
    let recovered_loops = select_chapter_lines(
        content,
        &["回收", "兑现", "解释", "揭开", "确认", "解决", "明白"],
        5,
    );
    let character_changes = select_chapter_lines(
        content,
        &[
            "角色", "人物", "立场", "变化", "关系", "信任", "误会", "疏离", "依赖",
        ],
        6,
    );
    let setting_changes = select_chapter_lines(
        content,
        &[
            "规则", "资源", "合同", "钱", "证据", "身份", "地点", "禁写", "边界",
        ],
        5,
    );

    format!(
        "### {chapter_id}《{title}》\n\n\
         - 状态：已保存为作者确认蓝图；若本章正文已确认，事实库以正文为准。\n\
         - 本章蓝图摘要：{synopsis}\n\n\
         #### 情节推进\n{plot_progress}\n\n\
         #### 埋设伏笔\n{seeded_loops}\n\n\
         #### 回收伏笔\n{recovered_loops}\n\n\
         #### 人物成长 / 状态变化\n{character_changes}\n\n\
         #### 设定 / 规则 / 资源变化\n{setting_changes}\n\n\
         #### 待人工确认\n- 本条来自蓝图确认链；正文确认后会自动覆盖同章蓝图事实。"
    )
}

pub(crate) fn extract_blueprint_facts(chapter_id: &str, title: &str, content: &str) -> Vec<String> {
    let mut facts = vec![format!(
        "- {chapter_id}《{title}》已保存为作者确认蓝图；本章未确认正文前，后续 AI 生成必须尊重。{}",
        fact_source_marker(chapter_id, title, content, title)
    )];

    for keyword in [
        "目标", "必须", "伏笔", "回收", "角色", "关系", "冲突", "证据", "合同", "现金", "诊所",
        "深圳", "CBD",
    ] {
        if content.contains(keyword) {
            facts.push(format!(
                "- {chapter_id} 蓝图提到：{keyword}。{}",
                fact_source_marker(chapter_id, title, content, keyword)
            ));
        }
    }

    facts
}

pub(crate) fn fact_source_marker(chapter_id: &str, title: &str, content: &str, needle: &str) -> String {
    let paragraphs = source_paragraphs(content);
    let matched = paragraphs
        .iter()
        .position(|paragraph| !needle.is_empty() && paragraph.contains(needle))
        .or_else(|| {
            paragraphs
                .iter()
                .position(|paragraph| !paragraph.starts_with('#'))
        })
        .unwrap_or(0);
    let snippet = paragraphs
        .get(matched)
        .map(|paragraph| trim_source_snippet(paragraph))
        .unwrap_or_default();

    format!(
        " 来源：第 {chapter_id} 章《{title}》，段落 {}：{snippet}",
        matched + 1
    )
}

pub(crate) fn source_paragraphs(content: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    let mut current = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                paragraphs.push(current.join(" "));
                current.clear();
            }
        } else {
            current.push(line.trim().to_owned());
        }
    }

    if !current.is_empty() {
        paragraphs.push(current.join(" "));
    }

    paragraphs
}

pub(crate) fn trim_source_snippet(paragraph: &str) -> String {
    let compact = paragraph.replace('\t', " ").trim().to_owned();
    if compact.chars().count() <= 80 {
        compact
    } else {
        format!("{}...", compact.chars().take(80).collect::<String>())
    }
}

pub(crate) fn write_classified_fact_files(root: &Path, facts: &[String]) -> Result<(), ProjectError> {
    for (relative_path, title) in CLASSIFIED_FACT_FILES {
        let matched: Vec<&String> = facts
            .iter()
            .filter(|fact| classified_fact_path(fact) == *relative_path)
            .collect();
        let mut content = format!("# {title}\n\n");
        if matched.is_empty() {
            content.push_str("暂无自动抽取内容。作者可以手动补充。\n");
        } else {
            for fact in matched {
                content.push_str(fact);
                content.push('\n');
            }
        }
        let target = ensure_project_path(root, relative_path)?;
        atomic_write_text(&target, &content)?;
    }
    Ok(())
}

pub(crate) fn classified_fact_path(fact: &str) -> &'static str {
    let fact_body = fact.split(" 来源：").next().unwrap_or(fact);
    if fact_body.contains("角色") || fact_body.contains("人物") || fact_body.contains("出场")
    {
        "facts/character-facts.md"
    } else if fact_body.contains("时间") || fact_body.contains("年") || fact_body.contains("章")
    {
        "facts/time-facts.md"
    } else if fact_body.contains("地点")
        || fact_body.contains("CBD")
        || fact_body.contains("深圳")
        || fact_body.contains("诊所")
    {
        "facts/location-facts.md"
    } else if fact_body.contains("关系") || fact_body.contains("冲突") || fact_body.contains("爱")
    {
        "facts/relation-facts.md"
    } else if fact_body.contains("规则")
        || fact_body.contains("世界观")
        || fact_body.contains("禁止")
    {
        "facts/world-rules.md"
    } else {
        "facts/event-facts.md"
    }
}

pub(crate) fn read_classified_fact_files(root: &Path) -> Result<String, ProjectError> {
    let mut content = String::new();
    for (relative_path, title) in CLASSIFIED_FACT_FILES {
        let file = read_optional_project_file(root, relative_path)?;
        if !file.trim().is_empty() {
            content.push_str(&format!("## {title}\n\n{file}\n\n"));
        }
    }
    Ok(content)
}

pub(crate) fn knowledge_relative_path(kind: &str) -> &'static str {
    match kind {
        "open-loops" => "facts/open-loops.md",
        "forbidden-rules" => "facts/forbidden-rules.md",
        "author-confirmation" => "facts/author-confirmation.md",
        _ => "facts/confirmed-facts.md",
    }
}

pub(crate) fn read_confirmed_manuscripts_for_prompt(root: &Path) -> Result<String, ProjectError> {
    let chapters_dir = ensure_project_path(root, "manuscript/chapters")?;
    let mut chunks = Vec::new();
    if chapters_dir.exists() {
        for entry in fs::read_dir(chapters_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md");
            let content = fs::read_to_string(&path)?;
            if is_placeholder_or_empty(&content) {
                continue;
            }
            chunks.push(format!(
                "### {name}\n\n{}",
                content.lines().take(180).collect::<Vec<_>>().join("\n")
            ));
        }
    }
    chunks.sort();
    Ok(chunks.join("\n\n---\n\n"))
}

pub(crate) fn knowledge_generation_target(
    kind: &str,
) -> Result<(&'static str, &'static str, &'static str), ProjectError> {
    match kind {
        "confirmed-facts" => Ok((
            "facts/confirmed-facts.md",
            "已确认事实",
            "从作者已经保存的正文中生成事实库。必须覆盖情节推进、伏笔、回收伏笔、人物成长、关系变化、设定资源变化、时间地点锚点和待人工确认项。只能写已经发生或正文明确支持的内容。",
        )),
        "open-loops" => Ok((
            "facts/open-loops.md",
            "未闭合伏笔",
            "从正文、蓝图和故事框架中提取仍未解决的伏笔、承诺、疑问、债务、风险、关系悬念。每条要说明来源、当前状态、预计回收方向和禁止提前解决的边界。",
        )),
        "forbidden-rules" => Ok((
            "facts/forbidden-rules.md",
            "禁止违背",
            "整理后续 AI 写作不能违背的硬规则。包括已确认情节、人物边界、时间线、世界规则、文风禁忌、不能提前发生的事件和不能推翻的作者确认内容。",
        )),
        _ => Err(ProjectError::InvalidInput(
            "未知知识库文件类型。".to_owned(),
        )),
    }
}

pub(crate) fn compose_knowledge_generation_prompt(
    title: &str,
    instruction: &str,
    author_input: &str,
    current_content: &str,
    manuscripts: &str,
    framework: &str,
    confirmed_facts: &str,
    open_loops: &str,
    forbidden_rules: &str,
    skills: &str,
) -> String {
    format!(
        "# {title} 再次生成任务\n\n\
         ## 目标\n{instruction}\n\n\
         ## 输出要求\n\
         1. 只输出完整 Markdown 文件内容，以 `# {title}` 开头。\n\
         2. 不要输出解释、JSON、代码块或寒暄。\n\
         3. 不能虚构正文没有支撑的“已确认事实”。不确定内容放入“待人工确认”。\n\
         4. 作者可以继续编辑，所以内容要清晰、分组、可删改。\n\n\
         ## 作者补充要求\n\n{author_input}\n\n\
         ## 当前文件旧版\n\n{current_content}\n\n\
         ## 已确认正文\n\n{manuscripts}\n\n\
         ## 故事框架\n\n{framework}\n\n\
         ## 已确认事实\n\n{confirmed_facts}\n\n\
         ## 未闭合伏笔\n\n{open_loops}\n\n\
         ## 禁止违背\n\n{forbidden_rules}\n\n\
         ## 本次事实库生成应遵守的 Skill\n\n{skills}\n\n\
         请再次生成 `# {title}` 文件。"
    )
}

pub(crate) fn local_knowledge_file_draft(title: &str, kind: &str, reason: &str) -> String {
    let body = match kind {
        "confirmed-facts" => {
            "## 章节记忆索引\n\n- 暂未调用到 AI。请检查 AI Provider 后再次生成。\n\n## 原子事实索引\n\n- 待从作者确认正文抽取。\n\n## 待人工确认\n\n- 本次为本地占位结果。"
        }
        "open-loops" => {
            "## 未解决伏笔\n\n- 暂未调用到 AI。请检查 AI Provider 后再次生成。\n\n## 预计回收方向\n\n- 待作者或 AI 补充。\n\n## 禁止提前解决\n\n- 未经作者确认，不要提前关闭核心悬念。"
        }
        "forbidden-rules" => {
            "## 硬规则\n\n- 暂未调用到 AI。请检查 AI Provider 后再次生成。\n\n## 禁止推翻\n\n- 不得推翻作者已经保存的正文。\n\n## 文风禁忌\n\n- 不要替作者输出未经确认的设定。"
        }
        _ => "- 暂未调用到 AI。请检查 AI Provider 后再次生成。",
    };
    format!("# {title}\n\n> 生成状态：{reason}\n\n{body}\n")
}

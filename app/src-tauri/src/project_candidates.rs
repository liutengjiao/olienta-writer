use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_ai_providers::{
    append_model_call_log, call_openai_compatible_with_system, is_retryable_provider_chat_error,
    provider_label, provider_usage_warnings, select_chapter_provider, select_provider_for_use_case,
    ModelCallLog,
};
use crate::project_candidate_review::{
    candidate_review_issues_from_warnings, compose_style_fingerprint_guidance,
    load_project_style_fingerprint, review_candidate_with_context,
    trim_for_status, write_candidate_fact_draft, write_candidate_review_report,
    write_chapter_story_contract, write_style_fingerprint_snapshot,
};
use crate::project_core::{
    load_chapter_side_file, normalize_chapter_id,
    read_framework_files, read_optional_project_file, read_project_yaml, save_chapter_side_file,
    trim_to_chars, write_author_visible_candidate_draft,
};
use crate::project_events::{append_system_event, append_workflow_task_history};
use crate::project_files::is_previewable_project_text;
use crate::project_knowledge::{read_character_context, read_classified_fact_files};
use crate::project_skills::read_selected_skills_for_task;
use crate::project_timeline::read_timeline_context;
use crate::project_types::{
    AiChatContextItem, AiChatInput, AiChatResult, BlueprintHistorySummary, CandidateDraft,
    CandidateConfirmationIndex, CandidateConfirmationIndexEntry, CandidateHistoryManifest,
    PinnedContextItem, PinSearchResultInput, ProjectError, ProjectFileDocument, WritingBrief,
};
use crate::project_volumes::{read_project_volumes, volume_for_chapter};

type CandidateGenerationResult = crate::project_types::DraftGenerationResult;
use crate::project_types::DraftGenerationResult;

static CANCELLED_AI_REQUESTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

pub fn load_candidate(
    root_path: String,
    chapter_id: String,
) -> Result<ProjectFileDocument, ProjectError> {
    load_chapter_side_file(root_path, chapter_id, "manuscript/candidates")
}

pub fn save_candidate(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    save_candidate_with_restore_source(root_path, chapter_id, content, None, None, None)
}

pub fn save_candidate_with_restore_source(
    root_path: String,
    chapter_id: String,
    content: String,
    restored_from_history_path: Option<String>,
    restored_from_confirmation_path: Option<String>,
    restored_from_confirmation_entry_id: Option<String>,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(&root_path);
    let id = normalize_chapter_id(&chapter_id);
    backup_existing_candidate(&root, &id)?;
    let saved = save_chapter_side_file(
        root_path,
        id.clone(),
        "manuscript/candidates",
        content.clone(),
    )?;
    write_author_visible_candidate_draft(&root, &id, &content)?;
    let warnings = review_candidate_with_context(&root, &id, &content)?;
    let review_path = write_candidate_review_report(
        &root,
        &id,
        &saved.relative_path,
        &format!("tasks/writing-briefs/{id}.md"),
        &warnings,
    )?;
    write_current_candidate_manifest(
        &root,
        &id,
        &format!("tasks/writing-briefs/{id}.md"),
        &review_path,
        None,
        restored_from_history_path.clone(),
        restored_from_confirmation_path.clone(),
        restored_from_confirmation_entry_id.clone(),
    )?;
    append_workflow_task_history(
        &root,
        "candidate_reviewed",
        "done",
        serde_json::json!({
            "chapterId": id,
            "candidatePath": saved.relative_path,
            "reviewPath": review_path,
            "warningCount": warnings.len(),
            "restoredFromHistoryPath": restored_from_history_path.unwrap_or_default(),
            "restoredFromConfirmationPath": restored_from_confirmation_path.unwrap_or_default(),
            "restoredFromConfirmationEntryId": restored_from_confirmation_entry_id.unwrap_or_default()
        }),
    )?;
    Ok(saved)
}

pub fn list_candidate_history(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<BlueprintHistorySummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let history_dir = ensure_project_path(&root, &format!("manuscript/candidates/history/{id}"))?;
    let mut items = Vec::new();

    if !history_dir.exists() {
        return Ok(items);
    }

    for entry in fs::read_dir(history_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("history.md")
            .to_owned();
        let metadata = fs::metadata(&path)?;
        let manifest = read_candidate_history_manifest(&path).ok().flatten();

        items.push(BlueprintHistorySummary {
            name: file_name.clone(),
            relative_path: format!("manuscript/candidates/history/{id}/{file_name}"),
            bytes: metadata.len(),
            backup_time_ms: manifest.as_ref().map(|item| item.backup_time_ms),
            candidate_path: manifest.as_ref().map(|item| item.candidate_path.clone()),
            writing_brief_path: manifest
                .as_ref()
                .map(|item| item.writing_brief_path.clone()),
            revision_path: manifest.as_ref().map(|item| item.revision_path.clone()),
            review_path: manifest.as_ref().map(|item| item.review_path.clone()),
            model_call_log_path: manifest
                .as_ref()
                .map(|item| item.model_call_log_path.clone()),
            model_call_log_entry_id: manifest
                .as_ref()
                .and_then(|item| item.model_call_log_entry_id.clone()),
            adoption_status: manifest
                .as_ref()
                .and_then(|item| item.adoption_status.clone()),
            adoption_mode: manifest
                .as_ref()
                .and_then(|item| item.adoption_mode.clone()),
            confirmation_path: manifest
                .as_ref()
                .and_then(|item| item.confirmation_path.clone()),
            confirmation_entry_id: manifest
                .as_ref()
                .and_then(|item| item.confirmation_entry_id.clone()),
            restored_from_history_path: manifest
                .as_ref()
                .and_then(|item| item.restored_from_history_path.clone()),
            restored_from_confirmation_path: manifest
                .as_ref()
                .and_then(|item| item.restored_from_confirmation_path.clone()),
            restored_from_confirmation_entry_id: manifest
                .as_ref()
                .and_then(|item| item.restored_from_confirmation_entry_id.clone()),
            restored_at_ms: manifest.as_ref().and_then(|item| item.restored_at_ms),
            manifest_path: manifest.as_ref().map(|_| {
                format!(
                    "manuscript/candidates/history/{id}/{}",
                    file_name.replace(".md", ".json")
                )
            }),
        });
    }

    items.sort_by(|left, right| right.name.cmp(&left.name));
    Ok(items)
}

pub fn load_candidate_history(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let normalized = relative_path.replace('\\', "/");
    if !normalized.starts_with("manuscript/candidates/history/") || !normalized.ends_with(".md") {
        return Err(ProjectError::InvalidInput(
            "candidate history path must stay inside manuscript/candidates/history".to_owned(),
        ));
    }

    let root = PathBuf::from(root_path);
    let path = ensure_project_path(&root, &normalized)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path: normalized,
        content,
    })
}

pub fn record_candidate_history_restore(
    root_path: String,
    chapter_id: String,
    history_path: String,
    candidate_path: String,
    confirmation_path: Option<String>,
    confirmation_entry_id: Option<String>,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let normalized = history_path.replace('\\', "/");
    if !normalized.starts_with(&format!("manuscript/candidates/history/{id}/"))
        || !normalized.ends_with(".md")
    {
        return Err(ProjectError::InvalidInput(
            "candidate history restore path must stay inside current chapter history".to_owned(),
        ));
    }

    let path = ensure_project_path(&root, &normalized)?;
    let content = fs::read_to_string(&path).unwrap_or_default();
    append_system_event(
        &root,
        "candidate_history_restored",
        serde_json::json!({
            "chapterId": id,
            "historyPath": normalized.clone(),
            "candidatePath": candidate_path.clone(),
            "confirmationPath": confirmation_path.unwrap_or_default(),
            "confirmationEntryId": confirmation_entry_id.unwrap_or_default(),
            "savedToCandidateFile": false
        }),
    )?;
    append_workflow_task_history(
        &root,
        "candidate_history_restore_previewed",
        "done",
        serde_json::json!({
            "chapterId": id,
            "historyPath": normalized.clone(),
            "candidatePath": candidate_path,
            "savedToCandidateFile": false
        }),
    )?;

    Ok(ProjectFileDocument {
        relative_path: normalized,
        content,
    })
}

pub fn compose_writing_brief(
    root_path: String,
    chapter_id: String,
) -> Result<WritingBrief, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("tasks/writing-briefs/{id}.md");
    let blueprint = read_optional_project_file(&root, &format!("blueprints/chapters/{id}.md"))?;
    let author_input =
        read_optional_project_file(&root, &format!("manuscript/author-input/{id}.md"))?;
    let confirmed_facts = read_optional_project_file(&root, "facts/confirmed-facts.md")?;
    let classified_facts = read_classified_fact_files(&root)?;
    let author_confirmation = read_optional_project_file(&root, "facts/author-confirmation.md")?;
    let open_loops = read_optional_project_file(&root, "facts/open-loops.md")?;
    let methodology = read_optional_project_file(&root, ".olienta/writing-methodology.json")?;
    let framework = read_framework_files(&root)?;
    let character_context = read_character_context(&root)?;
    let timeline_context = read_timeline_context(&root)?;
    let volume_context = compose_volume_context(&root, &id)?;
    let pinned_context =
        read_optional_project_file(&root, &format!("tasks/pinned-context/{id}.md"))?;
    let revision_checklist =
        read_optional_project_file(&root, &format!("tasks/contract-revisions/{id}.md"))?;
    let skills = read_selected_skills_for_task(&root, "chapter")?;
    let forbidden_rules = read_optional_project_file(&root, "facts/forbidden-rules.md")?;
    let contract = write_chapter_story_contract(
        &root,
        &id,
        &blueprint,
        &confirmed_facts,
        &forbidden_rules,
        &open_loops,
        &character_context,
        &timeline_context,
    )?;
    let autonovel_guidance = compose_autonovel_writing_brief_guidance(
        &root,
        &id,
        &blueprint,
        &author_input,
        &open_loops,
        &character_context,
        &forbidden_rules,
    )?;
    let style_fingerprint = load_project_style_fingerprint(&root)?;
    let style_config = read_optional_project_file(&root, "framework/06-style.md")?;
    let style_guidance =
        compose_style_fingerprint_guidance(style_fingerprint.as_ref(), &style_config);
    if let Some(fingerprint) = style_fingerprint.as_ref() {
        write_style_fingerprint_snapshot(&root, fingerprint, &style_config)?;
    }

    let mut content = String::new();
    content.push_str(&format!("# 第 {id} 章写作任务书\n\n"));
    content.push_str(&format!("章节：`{id}`\n\n"));
    content.push_str("Olienta 会为当前章节装配本地 Story System 上下文。AI 输出必须先保存为候选稿，只有作者明确采用后才能进入正文。\n\n");
    content.push_str("## 边界\n\n");
    content.push_str("1. 尊重作者确认、事实库、框架文件、章节蓝图和已选 Skill。\n");
    content.push_str("2. 不要提前揭示高潮、真相、伏笔回收或角色转折。\n");
    content.push_str("3. 如果蓝图、事实、角色卡或时间线存在冲突，必须明确提醒。\n");
    content.push_str("4. 生成文本先进入候选稿，不得直接覆盖已确认正文。\n\n");
    content.push_str(&format!("## 输出位置\n\n- 候选稿：`manuscript/candidates/{id}.md`\n- 正文：`manuscript/chapters/{id}.md`\n\n"));
    content.push_str(&autonovel_guidance);
    content.push_str(&style_guidance);
    content.push_str(&format!("## 章节蓝图\n\n{blueprint}\n\n"));
    if !volume_context.trim().is_empty() {
        content.push_str(&format!("## 分卷位置\n\n{volume_context}\n\n"));
    }
    content.push_str(&format!("## 作者输入\n\n{author_input}\n\n"));
    content.push_str(&format!("## 框架参考\n\n{framework}\n\n"));
    content.push_str(&format!("## 角色上下文\n\n{character_context}\n\n"));
    content.push_str(&format!("## 时间线\n\n{timeline_context}\n\n"));
    content.push_str(&format!(
        "## 章级合同\n\n- 合同文件：`{}`\n- 必须项：{}\n- 禁止项：{}\n- 事实项：{}\n- 角色项：{}\n- 时间线项：{}\n\n",
        contract.relative_path,
        contract.required_count,
        contract.forbidden_count,
        contract.fact_count,
        contract.character_count,
        contract.timeline_count
    ));
    if !revision_checklist.trim().is_empty() {
        content.push_str(&format!("## 本轮回修目标\n\n{}\n\n", revision_checklist));
    }
    content.push_str(&format!("## 已确认事实\n\n{confirmed_facts}\n\n"));
    content.push_str(&format!("## 分类事实\n\n{classified_facts}\n\n"));
    content.push_str(&format!("## 作者确认链\n\n{author_confirmation}\n\n"));
    content.push_str(&format!("## 未闭合伏笔\n\n{open_loops}\n\n"));
    content.push_str(&format!("## 已选 Skill\n\n{skills}\n\n"));
    content.push_str(&format!("## 写作方法配置\n\n```json\n{methodology}\n```\n"));

    if !pinned_context.trim().is_empty() {
        content.push_str("\n## 钉选检索材料\n");
        content.push_str(&pinned_context);
        if !content.ends_with('\n') {
            content.push('\n');
        }
    }

    let target = ensure_project_path(&root, &relative_path)?;
    atomic_write_text(&target, &content)?;
    append_workflow_task_history(
        &root,
        "writing_brief_composed",
        "done",
        serde_json::json!({
            "chapterId": id,
            "path": relative_path,
            "storyContractPath": contract.relative_path,
            "revisionPath": format!("tasks/contract-revisions/{id}.md"),
            "revisionChecklistIncluded": !revision_checklist.trim().is_empty(),
            "inputBlueprint": format!("blueprints/chapters/{id}.md"),
            "inputAuthorNote": format!("manuscript/author-input/{id}.md")
        }),
    )?;

    Ok(WritingBrief {
        chapter_id: id,
        relative_path,
        content,
    })
}

pub fn pin_search_result_to_writing_brief(
    root_path: String,
    chapter_id: String,
    source_path: String,
    line_number: usize,
    snippet: String,
) -> Result<WritingBrief, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let normalized_source =
        append_pinned_search_result(&root, &id, &source_path, line_number, &snippet)?;

    append_workflow_task_history(
        &root,
        "search_result_pinned_to_brief",
        "done",
        serde_json::json!({
            "chapterId": id,
            "sourcePath": normalized_source,
            "lineNumber": line_number.max(1),
            "pinnedPath": format!("tasks/pinned-context/{id}.md"),
        }),
    )?;

    compose_writing_brief(root.to_string_lossy().to_string(), id)
}

pub fn pin_search_results_to_writing_brief(
    root_path: String,
    chapter_id: String,
    results: Vec<PinSearchResultInput>,
) -> Result<WritingBrief, ProjectError> {
    if results.is_empty() {
        return Err(ProjectError::InvalidInput(
            "请选择至少一条检索结果。".to_owned(),
        ));
    }

    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let mut pinned_sources = Vec::new();

    for result in results {
        let normalized_source = append_pinned_search_result(
            &root,
            &id,
            &result.source_path,
            result.line_number,
            &result.snippet,
        )?;
        pinned_sources.push(serde_json::json!({
            "sourcePath": normalized_source,
            "lineNumber": result.line_number.max(1)
        }));
    }

    append_workflow_task_history(
        &root,
        "search_results_pinned_to_brief",
        "done",
        serde_json::json!({
            "chapterId": id,
            "count": pinned_sources.len(),
            "sources": pinned_sources,
            "pinnedPath": format!("tasks/pinned-context/{id}.md"),
        }),
    )?;

    compose_writing_brief(root.to_string_lossy().to_string(), id)
}

pub fn list_pinned_context(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<PinnedContextItem>, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("tasks/pinned-context/{id}.md");
    let content = read_optional_project_file(&root, &relative_path)?;
    Ok(parse_pinned_context_items(&content))
}

pub fn remove_pinned_context_item(
    root_path: String,
    chapter_id: String,
    index: usize,
) -> Result<WritingBrief, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("tasks/pinned-context/{id}.md");
    let content = read_optional_project_file(&root, &relative_path)?;
    let mut items = parse_pinned_context_items(&content);
    if index >= items.len() {
        return Err(ProjectError::InvalidInput(
            "要移除的钉选材料不存在。".to_owned(),
        ));
    }

    items.remove(index);
    let mut next = format!(
        "# 第{id}章钉选检索材料\n\n这里保存作者从知识库检索页手动加入的材料。AI 生成候选稿时必须读取，但仍不得覆盖作者确认内容。\n"
    );
    for item in &items {
        next.push_str(&format!(
            "\n## {}:{}\n\n{}\n",
            item.source_path, item.line_number, item.snippet
        ));
    }
    atomic_write_text(&ensure_project_path(&root, &relative_path)?, &next)?;

    append_workflow_task_history(
        &root,
        "pinned_context_removed",
        "done",
        serde_json::json!({
            "chapterId": id,
            "index": index,
            "pinnedPath": relative_path,
        }),
    )?;

    compose_writing_brief(root.to_string_lossy().to_string(), id)
}

pub(crate) fn compose_autonovel_writing_brief_guidance(
    root: &Path,
    chapter_id: &str,
    blueprint: &str,
    author_input: &str,
    open_loops: &str,
    character_context: &str,
    forbidden_rules: &str,
) -> Result<String, ProjectError> {
    let previous_tail = read_previous_chapter_tail(root, chapter_id)?;
    let handoff = if previous_tail.trim().is_empty() {
        "- 本章是开篇或暂无上一章正文；第一句需要直接建立场景压力，不要先解释设定。".to_owned()
    } else {
        format!(
            "- 从上一章末尾承接：`{}`\n- 第一句应回应上一章最后的动作、地点或情绪余波。",
            trim_for_status(&previous_tail)
        )
    };

    let must_recover = select_lines_by_keywords(
        &format!("{blueprint}\n{author_input}\n{open_loops}"),
        &["必须回收", "本章回收", "兑现", "答案", "harvested"],
        8,
    );
    let pending_loops = select_lines_by_keywords(
        open_loops,
        &["pending", "seeded", "伏笔", "线索", "承诺", "秘密"],
        8,
    );
    let forbidden = select_lines_by_keywords(
        &format!("{blueprint}\n{forbidden_rules}"),
        &["禁止", "不得", "不能", "提前", "禁写"],
        10,
    );
    let character_state = select_character_state_lines(character_context, 8);
    let reader_expectations = infer_reader_expectations(blueprint, open_loops);

    Ok(format!(
        "## Autonovel 写作任务增强\n\n### 第一句承接点\n\n{handoff}\n\n### 必须回收的伏笔\n\n{}\n\n### 不得擅自回收的伏笔\n\n{}\n\n### 角色当前状态\n\n{}\n\n### 禁止提前发生事项\n\n{}\n\n### 本章读者期待\n\n{}\n\n",
        markdown_lines_or_empty(&must_recover, "暂无明确必须回收项；除非蓝图或作者输入要求，不要强行回收伏笔。"),
        markdown_lines_or_empty(&pending_loops, "暂无可识别未闭合伏笔；保持新线索可追踪。"),
        markdown_lines_or_empty(&character_state, "暂无角色状态摘要；写作前请补充角色卡或本章作者输入。"),
        markdown_lines_or_empty(&forbidden, "暂无额外禁写项；仍需遵守作者确认链和章级合同。"),
        markdown_lines_or_empty(&reader_expectations, "本章至少需要一个明确的场景压力、一次选择或一个可追踪变化。"),
    ))
}

pub(crate) fn read_previous_chapter_tail(root: &Path, chapter_id: &str) -> Result<String, ProjectError> {
    let number = chapter_id.parse::<u32>().unwrap_or(1);
    if number <= 1 {
        return Ok(String::new());
    }
    let previous_id = format!("{:03}", number - 1);
    let previous =
        read_optional_project_file(root, &format!("manuscript/chapters/{previous_id}.md"))?;
    Ok(previous
        .split("\n\n")
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty() && !paragraph.starts_with('#'))
        .last()
        .unwrap_or("")
        .chars()
        .rev()
        .take(180)
        .collect::<String>()
        .chars()
        .rev()
        .collect())
}

pub(crate) fn select_lines_by_keywords(source: &str, keywords: &[&str], limit: usize) -> Vec<String> {
    let mut output = Vec::new();
    for line in source.lines().map(str::trim) {
        let cleaned = line.trim_start_matches(['-', '*', ' ']).trim();
        if cleaned.is_empty() || cleaned.starts_with('#') {
            continue;
        }
        if keywords.iter().any(|keyword| cleaned.contains(keyword))
            && !output.contains(&cleaned.to_owned())
        {
            output.push(cleaned.to_owned());
        }
        if output.len() >= limit {
            break;
        }
    }
    output
}

pub(crate) fn select_character_state_lines(character_context: &str, limit: usize) -> Vec<String> {
    let mut output = Vec::new();
    for line in character_context.lines().map(str::trim) {
        let cleaned = line.trim_start_matches(['-', '*', ' ']).trim();
        if cleaned.is_empty() {
            continue;
        }
        if cleaned.starts_with("## ")
            || cleaned.contains("状态")
            || cleaned.contains("目标")
            || cleaned.contains("关系")
            || cleaned.contains("伤")
            || cleaned.contains("秘密")
        {
            output.push(cleaned.to_owned());
        }
        if output.len() >= limit {
            break;
        }
    }
    output
}

pub(crate) fn infer_reader_expectations(blueprint: &str, open_loops: &str) -> Vec<String> {
    let mut expectations = Vec::new();
    if blueprint.contains("冲突") || blueprint.contains("对抗") {
        expectations.push("读者期待看到冲突升级，而不是只获得背景说明。".to_owned());
    }
    if blueprint.contains("选择") || blueprint.contains("代价") {
        expectations.push("读者期待角色做出有代价的选择，并看到即时后果。".to_owned());
    }
    if !open_loops.trim().is_empty() {
        expectations.push("读者期待至少一个既有伏笔被触碰、推进或被更清楚地悬置。".to_owned());
    }
    if expectations.is_empty() {
        expectations.push("读者期待本章产生一个可记住的画面、信息差或下一章牵引。".to_owned());
    }
    expectations
}

pub(crate) fn markdown_lines_or_empty(lines: &[String], empty: &str) -> String {
    if lines.is_empty() {
        return format!("- {empty}");
    }
    lines
        .iter()
        .map(|line| format!("- {line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[allow(dead_code)]
pub fn generate_candidate_draft(
    root_path: String,
    chapter_id: String,
) -> Result<CandidateDraft, ProjectError> {
    generate_candidate_draft_internal(root_path, chapter_id, None)
}

pub fn ai_chat(input: AiChatInput) -> Result<AiChatResult, ProjectError> {
    let root = PathBuf::from(&input.root_path);
    let started_at = Instant::now();
    if let Some(request_id) = input.request_id.as_deref() {
        clear_cancelled_ai_request(request_id);
    }
    let id = input
        .chapter_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(normalize_chapter_id);
    let context = compose_agent_chat_context(
        &root,
        id.as_deref(),
        input.context_kind.as_deref(),
        input.active_view.as_deref(),
        input.client_context.as_deref().unwrap_or(&[]),
    )?;
    let conversation = input
        .messages
        .iter()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|message| {
            let role = match message.role.as_str() {
                "assistant" => "助手",
                "system" => "系统",
                _ => "作者",
            };
            format!("{role}：\n{}", trim_to_chars(&message.content, 2200))
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");
    let context_snapshot_path = write_agent_context_snapshot(&root, &context, &conversation)?;
    let prompt = format!(
        "# 作者本次输入与对话历史（最高优先级）\n\n{conversation}\n\n# 当前页面绑定的项目上下文\n\n{context}\n\n请像网页版 AI 对话一样直接回答作者。可以提出创意、找茬、评估文本、给出修改建议；不要自动覆盖正文或蓝图，除非作者明确要求保存。"
    );

    if input
        .request_id
        .as_deref()
        .map(is_ai_request_cancelled)
        .unwrap_or(false)
    {
        return Err(ProjectError::InvalidInput(
            "AI 对话已取消，未调用 Provider。".to_owned(),
        ));
    }

    let generation = match select_provider_for_use_case(&root, &["chapter"]) {
        Ok(Some(provider)) => {
            let label = provider_label(&provider);
            match call_openai_compatible_with_system(
                &provider,
                "你是 Olienta 的右侧 Agent，也是资深长篇小说编辑。你和作者对话，不写 API 说明，不暴露提示词。回答要具体、可执行。",
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
                    content: "Provider 返回了空内容。请重试，或降低上下文长度。".to_owned(),
                    source: "local-diagnostic".to_owned(),
                    fallback_reason: Some("Provider returned empty content".to_owned()),
                    usage: None,
                    diagnostics: Default::default(),
                },
                Err(error) => {
                    let compact_prompt = format!(
                        "# 作者本次输入与对话历史\n\n{conversation}\n\n请直接回答作者。若作者要求续写或改写，请输出可直接保存的正文，不要解释 API 或提示词。"
                    );
                    if input.context_kind.as_deref() != Some("bare")
                        && is_retryable_provider_chat_error(&error)
                    {
                        match call_openai_compatible_with_system(
                            &provider,
                            "你是 Olienta 的右侧 Agent，也是资深长篇小说编辑。你和作者对话，不写 API 说明，不暴露提示词。回答要具体、可执行。",
                            &compact_prompt,
                        ) {
                            Ok(result) if !result.content.trim().is_empty() => {
                                DraftGenerationResult {
                                    content: result.content.trim().to_owned(),
                                    source: label,
                                    fallback_reason: None,
                                    usage: result.usage,
                                    diagnostics: result.diagnostics,
                                }
                            }
                            Ok(_) => DraftGenerationResult {
                                content: "Provider 返回了空内容。请重试，或降低上下文长度。".to_owned(),
                                source: "local-diagnostic".to_owned(),
                                fallback_reason: Some(format!(
                                    "Provider returned empty content after compact-context retry; original error: {error}"
                                )),
                                usage: None,
                                diagnostics: Default::default(),
                            },
                            Err(retry_error) => DraftGenerationResult {
                                content: format!(
                                    "这次对话调用失败：{retry_error}\n\n已尝试自动切换为精简上下文重试；原始错误：{error}"
                                ),
                                source: "local-diagnostic".to_owned(),
                                fallback_reason: Some(format!(
                                    "compact-context retry failed: {retry_error}; original error: {error}"
                                )),
                                usage: None,
                                diagnostics: Default::default(),
                            },
                        }
                    } else {
                        DraftGenerationResult {
                            content: format!(
                                "这次对话调用失败：{error}\n\n可以重试，或到 AI Provider 页面测试连接。"
                            ),
                            source: "local-diagnostic".to_owned(),
                            fallback_reason: Some(error),
                            usage: None,
                            diagnostics: Default::default(),
                        }
                    }
                },
            }
        }
        Ok(None) => DraftGenerationResult {
            content: "还没有可用的 AI Provider。请先到 AI Provider 页面保存并测试模型。".to_owned(),
            source: "local-diagnostic".to_owned(),
            fallback_reason: Some("No enabled Provider".to_owned()),
            usage: None,
            diagnostics: Default::default(),
        },
        Err(error) => DraftGenerationResult {
            content: format!("读取 Provider 配置失败：{error}"),
            source: "local-diagnostic".to_owned(),
            fallback_reason: Some(error.to_string()),
            usage: None,
            diagnostics: Default::default(),
        },
    };

    if input
        .request_id
        .as_deref()
        .map(is_ai_request_cancelled)
        .unwrap_or(false)
    {
        append_workflow_task_history(
            &root,
            "agent_chat_cancelled",
            "cancelled",
            serde_json::json!({
                "chapterId": id.clone().unwrap_or_default(),
                "requestId": input.request_id.clone().unwrap_or_default(),
                "elapsedMs": started_at.elapsed().as_millis(),
                "message": "Provider returned after cancellation; result was ignored."
            }),
        )?;
        return Err(ProjectError::InvalidInput(
            "AI 对话已取消，Provider 返回内容已忽略。".to_owned(),
        ));
    }

    let log_entry_id = append_model_call_log(
        &root,
        ModelCallLog {
            task: "agent-chat",
            chapter_id: id.as_deref(),
            provider: &generation.source,
            input_path: Some(&context_snapshot_path),
            output_path: Some("agent-panel/chat"),
            ok: generation.fallback_reason.is_none(),
            duration_ms: Some(started_at.elapsed().as_millis()),
            usage: generation.usage,
            diagnostics: Some(&generation.diagnostics),
            message: generation
                .fallback_reason
                .as_deref()
                .unwrap_or("Agent chat completed."),
        },
    )?;
    append_workflow_task_history(
        &root,
        "agent_chat_completed",
        if generation.fallback_reason.is_some() {
            "failed"
        } else {
            "done"
        },
        serde_json::json!({
            "chapterId": id.clone().unwrap_or_default(),
            "requestId": input.request_id.clone().unwrap_or_default(),
            "provider": generation.source.clone(),
            "modelCallLogPath": "logs/model-calls/history.md",
            "modelCallLogEntryId": log_entry_id.clone(),
            "contextSnapshotPath": context_snapshot_path.clone(),
            "fallbackReason": generation.fallback_reason.clone()
        }),
    )?;

    let warnings = provider_usage_warnings(&root, generation.usage);

    Ok(AiChatResult {
        content: generation.content,
        provider: generation.source,
        model: select_chapter_provider(&root)?
            .and_then(|provider| provider.model)
            .unwrap_or_default(),
        used_remote_model: generation.fallback_reason.is_none(),
        log_entry_id: Some(log_entry_id),
        context_snapshot_path: Some(context_snapshot_path),
        warnings,
    })
}

pub fn load_agent_chat_history(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = ".olienta/chat-history.json";
    let path = ensure_project_path(&root, relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_else(|_| "{}".to_owned());
    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

pub fn save_agent_chat_history(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = ".olienta/chat-history.json";
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|error| ProjectError::InvalidInput(format!("invalid chat history json: {error}")))?;
    let normalized = serde_json::to_string_pretty(&parsed)?;
    let path = ensure_project_path(&root, relative_path)?;
    atomic_write_text(&path, &format!("{normalized}\n"))?;
    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content: normalized,
    })
}

pub(crate) fn generate_candidate_draft_internal(
    root_path: String,
    chapter_id: String,
    request_id: Option<String>,
) -> Result<CandidateDraft, ProjectError> {
    let started_at = Instant::now();
    if let Some(request_id) = request_id.as_deref() {
        clear_cancelled_ai_request(request_id);
    }
    let brief = compose_writing_brief(root_path.clone(), chapter_id)?;
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&brief.chapter_id);
    append_workflow_task_history(
        &root,
        "candidate_draft_started",
        "working",
        serde_json::json!({
            "chapterId": id.clone(),
            "requestId": request_id.clone().unwrap_or_default(),
            "inputPath": brief.relative_path.clone(),
            "message": "Candidate draft generation started in background."
        }),
    )?;
    if request_id
        .as_deref()
        .map(is_ai_request_cancelled)
        .unwrap_or(false)
    {
        append_workflow_task_history(
            &root,
            "candidate_draft_cancelled",
            "cancelled",
            serde_json::json!({
                "chapterId": id.clone(),
                "requestId": request_id.clone().unwrap_or_default(),
                "elapsedMs": started_at.elapsed().as_millis()
            }),
        )?;
        return Err(ProjectError::InvalidInput(
            "AI generation request was cancelled before provider call.".to_owned(),
        ));
    }
    let generation = generate_candidate_content(&root, &id, &brief);
    if request_id
        .as_deref()
        .map(is_ai_request_cancelled)
        .unwrap_or(false)
    {
        append_workflow_task_history(
            &root,
            "candidate_draft_cancelled",
            "cancelled",
            serde_json::json!({
                "chapterId": id.clone(),
                "requestId": request_id.clone().unwrap_or_default(),
                "elapsedMs": started_at.elapsed().as_millis(),
                "message": "Provider returned after cancellation; result was not saved."
            }),
        )?;
        return Err(ProjectError::InvalidInput(
            "AI generation request was cancelled; provider result was ignored.".to_owned(),
        ));
    }
    let mut warnings = review_candidate_with_context(&root, &id, &generation.content)?;
    if let Some(reason) = generation.fallback_reason.as_ref() {
        warnings.push(format!("AI 调用降级：{reason}"));
    }
    warnings.extend(provider_usage_warnings(&root, generation.usage));
    warnings.push(format!("生成来源：{}", generation.source));
    warnings.push(format!("写作任务书：{}", brief.relative_path));
    let relative_path = format!("manuscript/candidates/{id}.md");
    backup_existing_candidate(&root, &id)?;
    let target = ensure_project_path(&root, &relative_path)?;
    atomic_write_text(&target, &generation.content)?;
    write_author_visible_candidate_draft(&root, &id, &generation.content)?;
    let review_path =
        write_candidate_review_report(&root, &id, &relative_path, &brief.relative_path, &warnings)?;
    let review_issues = candidate_review_issues_from_warnings(&warnings);
    let fact_draft_path = write_candidate_fact_draft(&root, &id, &generation.content)?;
    let model_call_log_entry_id = append_model_call_log(
        &root,
        ModelCallLog {
            task: "candidate-draft",
            chapter_id: Some(&id),
            provider: &generation.source,
            input_path: Some(&brief.relative_path),
            output_path: Some(&relative_path),
            ok: generation.fallback_reason.is_none(),
            duration_ms: Some(started_at.elapsed().as_millis()),
            usage: generation.usage,
            diagnostics: Some(&generation.diagnostics),
            message: generation
                .fallback_reason
                .as_deref()
                .unwrap_or("Candidate draft generated."),
        },
    )?;
    write_current_candidate_manifest(
        &root,
        &id,
        &brief.relative_path,
        &review_path,
        Some(model_call_log_entry_id.clone()),
        None,
        None,
        None,
    )?;
    append_workflow_task_history(
        &root,
        "candidate_draft_generated",
        if generation.fallback_reason.is_some() {
            "failed"
        } else {
            "done"
        },
        serde_json::json!({
            "chapterId": id.clone(),
            "requestId": request_id.clone().unwrap_or_default(),
            "inputPath": brief.relative_path.clone(),
            "outputPath": relative_path.clone(),
            "reviewPath": review_path.clone(),
            "factDraftPath": fact_draft_path.clone(),
            "modelCallLogPath": "logs/model-calls/history.md",
            "modelCallLogEntryId": model_call_log_entry_id.clone(),
            "provider": generation.source.clone(),
            "warningCount": warnings.len(),
            "elapsedMs": started_at.elapsed().as_millis(),
            "fallbackReason": generation.fallback_reason.clone()
        }),
    )?;

    Ok(CandidateDraft {
        chapter_id: id,
        relative_path,
        writing_brief_path: brief.relative_path,
        review_path,
        fact_draft_path,
        model_call_log_entry_id: Some(model_call_log_entry_id),
        content: generation.content,
        warnings,
        review_issues,
    })
}

pub(crate) fn compose_agent_chat_context(
    root: &Path,
    chapter_id: Option<&str>,
    context_kind: Option<&str>,
    active_view: Option<&str>,
    client_context: &[AiChatContextItem],
) -> Result<String, ProjectError> {
    let project = read_project_yaml(root)?;
    let mut parts = vec![format!(
        "- 项目：{}\n- 语言：{}\n- 章节数：{}",
        project.name, project.language, project.chapter_count
    )];

    let kind = context_kind.unwrap_or("general");
    match kind {
        "bare" | "none" => {}
        "settings" | "framework" => {
            add_agent_context_part(
                root,
                &mut parts,
                "故事梗概",
                "framework/02-premise.md",
                2400,
            )?;
            if let Some((label, path)) = framework_file_for_view(active_view.unwrap_or("")) {
                add_agent_context_part(root, &mut parts, label, path, 2200)?;
            }
            for (label, path, limit) in framework_context_files(active_view.unwrap_or("")) {
                add_agent_context_part(root, &mut parts, label, path, limit)?;
            }
            add_agent_context_part(
                root,
                &mut parts,
                "已确认事实",
                "facts/confirmed-facts.md",
                1200,
            )?;
            add_agent_context_part_from_text(
                root,
                &mut parts,
                "启用 Skill",
                &read_selected_skills_for_task(root, "framework")?,
                1800,
            );
        }
        "blueprint" => {
            add_agent_context_part(
                root,
                &mut parts,
                "大纲",
                "framework/04-plot-outline.md",
                2600,
            )?;
            for (label, path, limit) in [
                ("故事梗概", "framework/02-premise.md", 1800),
                ("角色图谱", "framework/03-characters.md", 1600),
                ("世界观", "framework/05-world.md", 1600),
                ("重要场景", "framework/07-scenes.md", 1400),
                ("时间轴", "timeline/events.md", 1400),
            ] {
                add_agent_context_part(root, &mut parts, label, path, limit)?;
            }
            if let Some(id) = chapter_id {
                add_neighbor_blueprint_context(root, &mut parts, id)?;
            }
            add_agent_context_part(root, &mut parts, "事实库", "facts/confirmed-facts.md", 1400)?;
            add_agent_context_part_from_text(
                root,
                &mut parts,
                "启用 Skill",
                &read_selected_skills_for_task(root, "blueprint")?,
                1800,
            );
        }
        "draft" | "chapter" => {
            if let Some(id) = chapter_id {
                add_agent_context_part(
                    root,
                    &mut parts,
                    "当章蓝图",
                    &format!("blueprints/chapters/{id}.md"),
                    2600,
                )?;
                add_previous_confirmed_chapters_context(root, &mut parts, id, 5)?;
                if kind == "chapter" {
                    add_agent_context_part(
                        root,
                        &mut parts,
                        "当前正文",
                        &format!("manuscript/chapters/{id}.md"),
                        2200,
                    )?;
                } else {
                    add_agent_context_part(
                        root,
                        &mut parts,
                        "当前候选稿",
                        &format!("manuscript/candidates/{id}.md"),
                        2200,
                    )?;
                }
            }
            add_agent_context_part(root, &mut parts, "事实库", "facts/confirmed-facts.md", 1600)?;
            add_agent_context_part_from_text(
                root,
                &mut parts,
                "启用 Skill",
                &read_selected_skills_for_task(root, "chapter")?,
                1800,
            );
        }
        _ => {
            for (label, path, limit) in [
                ("故事梗概", "framework/02-premise.md", 1800),
                ("角色图谱", "framework/03-characters.md", 1800),
                ("大纲", "framework/04-plot-outline.md", 2200),
                ("世界观", "framework/05-world.md", 1800),
                ("重要场景", "framework/07-scenes.md", 1600),
                ("时间轴", "timeline/events.md", 1400),
                ("已确认事实", "facts/confirmed-facts.md", 1200),
            ] {
                add_agent_context_part(root, &mut parts, label, path, limit)?;
            }
            add_agent_context_part_from_text(
                root,
                &mut parts,
                "启用 Skill",
                &read_selected_skills_for_task(root, "chat")?,
                1800,
            );
        }
    }
    add_client_context_parts(&mut parts, client_context);
    Ok(trim_agent_context(&parts.join("\n\n---\n\n")))
}

pub(crate) fn add_client_context_parts(parts: &mut Vec<String>, client_context: &[AiChatContextItem]) {
    for item in client_context.iter().take(8) {
        if item.content.trim().is_empty() {
            continue;
        }
        let label = sanitize_context_label(&item.label);
        let path = sanitize_context_label(&item.path);
        let title = if path.is_empty() {
            format!("Frontend current context: {label}")
        } else {
            format!("Frontend current context: {label} ({path})")
        };
        if !item.content.trim().is_empty() {
            add_agent_context_part_from_text(Path::new(""), parts, &title, &item.content, 3600);
            continue;
        }
        parts.push(format!(
            "## 前端当前未保存上下文：{label}\n\n路径：`{path}`\n\n{}",
            trim_to_chars(&item.content, 3600)
        ));
    }
}

pub(crate) fn sanitize_context_label(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_control())
        .take(120)
        .collect::<String>()
        .trim()
        .to_owned()
}

pub(crate) fn write_agent_context_snapshot(
    root: &Path,
    context: &str,
    conversation: &str,
) -> Result<String, ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let relative_path = format!("logs/agent-context/{timestamp}.md");
    let path = ensure_project_path(root, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let snapshot = format!(
        "# Agent 上下文快照\n\n## 作者本次输入与对话历史\n\n{conversation}\n\n---\n\n## 当前页面绑定的项目上下文\n\n{context}\n"
    );
    atomic_write_text(&path, &snapshot)?;
    Ok(relative_path)
}

pub(crate) fn add_agent_context_part(
    root: &Path,
    parts: &mut Vec<String>,
    label: &str,
    path: &str,
    limit: usize,
) -> Result<(), ProjectError> {
    let content = read_optional_project_file(root, path)?;
    add_agent_context_part_from_text(root, parts, label, &content, limit);
    Ok(())
}

pub(crate) fn add_agent_context_part_from_text(
    _root: &Path,
    parts: &mut Vec<String>,
    label: &str,
    content: &str,
    limit: usize,
) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return;
    }
    let fingerprint = agent_context_fingerprint(trimmed);
    let marker = format!("<!-- olienta-context:{fingerprint} -->");
    if parts.iter().any(|part| part.contains(&marker)) {
        return;
    }
    parts.push(format!(
        "{marker}\n## {label}\n\n{}",
        trim_to_chars(trimmed, limit)
    ));
}

pub(crate) fn trim_agent_context(context: &str) -> String {
    const MAX_AGENT_CONTEXT_CHARS: usize = 60_000;
    if context.chars().count() <= MAX_AGENT_CONTEXT_CHARS {
        return context.to_owned();
    }
    format!(
        "{}\n\n---\n\n[Olienta context trimmed: duplicate-free context exceeded {MAX_AGENT_CONTEXT_CHARS} characters.]",
        trim_to_chars(context, MAX_AGENT_CONTEXT_CHARS)
    )
}

pub(crate) fn agent_context_fingerprint(content: &str) -> u64 {
    let normalized = content
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    normalized.hash(&mut hasher);
    hasher.finish()
}

pub(crate) fn framework_file_for_view(view: &str) -> Option<(&'static str, &'static str)> {
    match view {
        "story-premise" => Some(("当前框架：故事梗概", "framework/02-premise.md")),
        "characters" => Some(("当前框架：角色图谱", "framework/03-characters.md")),
        "world" => Some(("当前框架：世界观", "framework/05-world.md")),
        "plot-outline" => Some(("当前框架：情节大纲", "framework/04-plot-outline.md")),
        "important-scenes" => Some(("当前框架：重要场景", "framework/07-scenes.md")),
        "timeline" => Some(("当前框架：时间线", "timeline/events.md")),
        _ => None,
    }
}

pub(crate) fn framework_context_files(view: &str) -> Vec<(&'static str, &'static str, usize)> {
    [
        ("角色图谱", "framework/03-characters.md", 1600),
        ("情节大纲", "framework/04-plot-outline.md", 2200),
        ("世界观", "framework/05-world.md", 1600),
        ("重要场景", "framework/07-scenes.md", 1400),
        ("时间线", "timeline/events.md", 1400),
    ]
    .into_iter()
    .filter(|(_, path, _)| {
        Some(*path) != framework_file_for_view(view).map(|(_, active_path)| active_path)
    })
    .collect()
}

pub(crate) fn add_neighbor_blueprint_context(
    root: &Path,
    parts: &mut Vec<String>,
    chapter_id: &str,
) -> Result<(), ProjectError> {
    let number = chapter_id.parse::<u32>().unwrap_or(1);
    if number > 1 {
        let previous_id = format!("{:03}", number - 1);
        add_agent_context_part(
            root,
            parts,
            "前章蓝图",
            &format!("blueprints/chapters/{previous_id}.md"),
            1400,
        )?;
    }
    let next_id = format!("{:03}", number + 1);
    add_agent_context_part(
        root,
        parts,
        "后章蓝图",
        &format!("blueprints/chapters/{next_id}.md"),
        1400,
    )?;
    Ok(())
}

pub(crate) fn add_previous_confirmed_chapters_context(
    root: &Path,
    parts: &mut Vec<String>,
    chapter_id: &str,
    max_count: u32,
) -> Result<(), ProjectError> {
    let number = chapter_id.parse::<u32>().unwrap_or(1);
    if number <= 1 {
        return Ok(());
    }

    let start = number.saturating_sub(max_count).max(1);
    for previous in start..number {
        let previous_id = format!("{previous:03}");
        add_agent_context_part(
            root,
            parts,
            &format!("前文已确认正文：第 {previous_id} 章"),
            &format!("manuscript/chapters/{previous_id}.md"),
            1200,
        )?;
    }
    Ok(())
}

pub fn generate_candidate_draft_with_request_id(
    root_path: String,
    chapter_id: String,
    request_id: Option<String>,
) -> Result<CandidateDraft, ProjectError> {
    generate_candidate_draft_internal(root_path, chapter_id, request_id)
}

pub fn cancel_ai_request(request_id: String) -> Result<bool, ProjectError> {
    if request_id.trim().is_empty() {
        return Ok(false);
    }
    let registry = CANCELLED_AI_REQUESTS.get_or_init(|| Mutex::new(HashSet::new()));
    let mut cancelled = registry.lock().map_err(|_| {
        ProjectError::InvalidInput("AI cancellation registry is poisoned.".to_owned())
    })?;
    Ok(cancelled.insert(request_id))
}

pub(crate) fn is_ai_request_cancelled(request_id: &str) -> bool {
    CANCELLED_AI_REQUESTS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .map(|cancelled| cancelled.contains(request_id))
        .unwrap_or(false)
}

pub(crate) fn clear_cancelled_ai_request(request_id: &str) {
    if let Ok(mut cancelled) = CANCELLED_AI_REQUESTS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
    {
        cancelled.remove(request_id);
    }
}

pub fn record_candidate_adoption(
    root_path: String,
    chapter_id: String,
    mode: String,
    candidate_path: String,
    manuscript_path: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let confirmation_file_name = if mode.starts_with("undo-") {
        format!("undo-{timestamp}.md")
    } else {
        format!("v{timestamp}.md")
    };
    let confirmation_entry_id = format!("{id}-{timestamp}-{}", mode.replace(['/', '\\', ' '], "-"));
    let confirmation_path = format!("logs/confirmations/{id}/{confirmation_file_name}");
    let latest_confirmation_path = format!("logs/confirmations/{id}.md");
    let confirmation_content = format!(
        "# 第 {id} 章候选稿采用确认\n\n\
         - 采用方式：{mode}\n\
         - 候选稿：{candidate_path}\n\
         - 正文文件：{manuscript_path}\n\
         - 事实库：facts/confirmed-facts.md\n\
         - 作者确认记录：facts/author-confirmation.md\n\n\
         ## 确认规则\n\n\
         作者点击采用并保存正文后，本章正文进入作者确认链。后续 AI 生成、改写、续写、蓝图再次生成和事实校验，都必须尊重已经保存的正文、事实库和作者确认记录，不得写出对立内容。\n"
    );
    let confirmation_target = ensure_project_path(&root, &confirmation_path)?;
    atomic_write_text(&confirmation_target, &confirmation_content)?;
    let latest_confirmation_target = ensure_project_path(&root, &latest_confirmation_path)?;
    atomic_write_text(&latest_confirmation_target, &confirmation_content)?;
    update_current_candidate_adoption_manifest(
        &root,
        &id,
        &mode,
        &confirmation_path,
        &confirmation_entry_id,
    )?;
    append_candidate_confirmation_index(
        &root,
        &id,
        &confirmation_entry_id,
        timestamp,
        &mode,
        &candidate_path,
        &manuscript_path,
        &confirmation_path,
        &latest_confirmation_path,
    )?;

    append_system_event(
        &root,
        "candidate_adopted",
        serde_json::json!({
            "chapterId": id,
            "mode": mode,
            "candidatePath": candidate_path,
            "manuscriptPath": manuscript_path,
            "confirmationPath": confirmation_path.clone(),
            "confirmationEntryId": confirmation_entry_id.clone(),
            "latestConfirmationPath": latest_confirmation_path.clone()
        }),
    )?;
    append_workflow_task_history(
        &root,
        "candidate_confirmation_summary_written",
        "done",
        serde_json::json!({
            "chapterId": id,
            "path": confirmation_path.clone(),
            "entryId": confirmation_entry_id,
            "latestPath": latest_confirmation_path
        }),
    )?;
    let relative_path = confirmation_path;
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub(crate) fn compose_volume_context(root: &Path, chapter_id: &str) -> Result<String, ProjectError> {
    let volumes = read_project_volumes(root)?;
    let Some(volume) = volume_for_chapter(&volumes, chapter_id) else {
        return Ok(String::new());
    };

    let mut content = format!(
        "- 所属分卷：{}\n- 分卷范围：第 {} 章到第 {} 章\n",
        volume.title, volume.start_chapter, volume.end_chapter
    );
    if !volume.summary.trim().is_empty() {
        content.push_str(&format!("- 分卷说明：{}\n", volume.summary.trim()));
    }
    Ok(content)
}

pub(crate) fn parse_pinned_context_items(content: &str) -> Vec<PinnedContextItem> {
    let mut items = Vec::new();
    let mut current_source = String::new();
    let mut current_line = 1usize;
    let mut current_body: Vec<String> = Vec::new();

    for line in content.lines() {
        if let Some((source, line_number)) = parse_pinned_context_heading(line) {
            if !current_source.is_empty() {
                let snippet = current_body.join("\n").trim().to_owned();
                if !snippet.is_empty() {
                    items.push(PinnedContextItem {
                        index: items.len(),
                        source_path: current_source.clone(),
                        line_number: current_line,
                        snippet,
                    });
                }
            }
            current_source = source;
            current_line = line_number;
            current_body.clear();
            continue;
        }

        if !current_source.is_empty() {
            current_body.push(line.to_owned());
        }
    }

    if !current_source.is_empty() {
        let snippet = current_body.join("\n").trim().to_owned();
        if !snippet.is_empty() {
            items.push(PinnedContextItem {
                index: items.len(),
                source_path: current_source,
                line_number: current_line,
                snippet,
            });
        }
    }

    items
}

#[cfg(test)]
mod agent_context_tests {
    use super::{
        add_agent_context_part_from_text, add_client_context_parts, load_agent_chat_history,
        save_agent_chat_history, trim_agent_context,
    };
    use crate::project_types::AiChatContextItem;
    use std::path::Path;

    #[test]
    fn agent_context_deduplicates_identical_content_across_labels() {
        let mut parts = Vec::new();
        add_agent_context_part_from_text(
            Path::new("."),
            &mut parts,
            "Outline",
            "same content\nsame line",
            200,
        );
        add_agent_context_part_from_text(
            Path::new("."),
            &mut parts,
            "Current outline",
            "same content\nsame line",
            200,
        );

        assert_eq!(parts.len(), 1);
        assert!(parts[0].contains("Outline"));
    }

    #[test]
    fn agent_context_has_hard_size_cap() {
        let long = "a".repeat(70_000);
        let trimmed = trim_agent_context(&long);
        assert!(trimmed.len() < long.len());
        assert!(trimmed.contains("Olienta context trimmed"));
    }

    #[test]
    fn client_context_reuses_deduplication_markers() {
        let mut parts = Vec::new();
        add_agent_context_part_from_text(
            Path::new("."),
            &mut parts,
            "Framework",
            "same content\nsame line",
            200,
        );
        add_client_context_parts(
            &mut parts,
            &[AiChatContextItem {
                label: "Unsaved framework".to_owned(),
                path: "framework/02-premise.md".to_owned(),
                content: "same content\nsame line".to_owned(),
            }],
        );

        assert_eq!(parts.len(), 1);
    }

    #[test]
    fn agent_chat_history_defaults_and_persists_project_file() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("novel");
        std::fs::create_dir_all(&root).unwrap();
        let root_path = root.to_string_lossy().to_string();

        let empty = load_agent_chat_history(root_path.clone()).unwrap();
        assert_eq!(empty.relative_path, ".olienta/chat-history.json");
        assert_eq!(empty.content, "{}");

        let saved = save_agent_chat_history(
            root_path.clone(),
            serde_json::json!({
                "chapter:001": [
                    { "role": "user", "content": "记住这个角色想法" }
                ]
            })
            .to_string(),
        )
        .unwrap();
        assert!(saved.content.contains("chapter:001"));

        let loaded = load_agent_chat_history(root_path).unwrap();
        assert!(loaded.content.contains("记住这个角色想法"));
    }

    #[test]
    fn agent_chat_history_rejects_invalid_json() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("novel");
        std::fs::create_dir_all(&root).unwrap();

        let result = save_agent_chat_history(
            root.to_string_lossy().to_string(),
            "{not json".to_owned(),
        );

        assert!(result.is_err());
    }
}

pub(crate) fn parse_pinned_context_heading(line: &str) -> Option<(String, usize)> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix("## ")?;
    let (source, line_number) = rest.rsplit_once(':')?;
    let parsed_line = line_number.trim().parse::<usize>().ok()?;
    let source = source.trim().to_owned();
    (!source.is_empty()).then_some((source, parsed_line.max(1)))
}

pub(crate) fn append_pinned_search_result(
    root: &Path,
    chapter_id: &str,
    source_path: &str,
    line_number: usize,
    snippet: &str,
) -> Result<String, ProjectError> {
    let normalized_source = source_path.replace("\\", "/");
    if !is_previewable_project_text(&normalized_source) {
        return Err(ProjectError::InvalidInput(
            "只有本地文本检索结果可以钉选进写作任务书。".to_owned(),
        ));
    }
    ensure_project_path(root, &normalized_source)?;

    fs::create_dir_all(ensure_project_path(root, "tasks/pinned-context")?)?;
    let pinned_path = format!("tasks/pinned-context/{chapter_id}.md");
    let target = ensure_project_path(root, &pinned_path)?;
    let mut content = fs::read_to_string(&target).unwrap_or_default();
    if content.trim().is_empty() {
        content.push_str(&format!("# 第 {chapter_id} 章钉选检索材料\n\n"));
        content.push_str("这些片段由作者手动选择，生成候选稿时必须纳入上下文。\n");
    }
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&format!(
        "\n## {}:{}\n\n{}\n",
        normalized_source,
        line_number.max(1),
        snippet.trim()
    ));
    atomic_write_text(&target, &content)?;

    Ok(normalized_source)
}

pub(crate) fn generate_candidate_content(
    root: &Path,
    chapter_id: &str,
    brief: &WritingBrief,
) -> CandidateGenerationResult {
    if let Ok(Some(provider)) = select_chapter_provider(root) {
        let label = provider_label(&provider);
        let system =
            "你是 Olienta 的整章正文 Agent。只输出当前章候选稿 Markdown，不得覆盖作者确认正文。";
        let prompt = format!(
            "# 章节\n\n{chapter_id}\n\n## 写作任务书\n\n{}",
            brief.content
        );
        match call_openai_compatible_with_system(&provider, system, &prompt) {
            Ok(result) if !result.content.trim().is_empty() => {
                return CandidateGenerationResult {
                    content: result.content.trim().to_owned(),
                    source: label,
                    fallback_reason: None,
                    usage: result.usage,
                    diagnostics: result.diagnostics,
                };
            }
            Ok(_) => {
                return CandidateGenerationResult {
                    content: format!(
                        "# 第 {chapter_id} 章候选稿\n\n根据写作任务书 `{}` 生成。\n\n{}",
                        brief.relative_path,
                        brief.content.lines().take(8).collect::<Vec<_>>().join("\n")
                    ),
                    source: "local-placeholder".to_owned(),
                    fallback_reason: Some(format!(
                        "Provider 返回空内容（{label}），已生成本地占位候选稿。"
                    )),
                    usage: None,
                    diagnostics: Default::default(),
                };
            }
            Err(error) => {
                return CandidateGenerationResult {
                    content: format!(
                        "# 第 {chapter_id} 章候选稿\n\n根据写作任务书 `{}` 生成。\n\n{}",
                        brief.relative_path,
                        brief.content.lines().take(8).collect::<Vec<_>>().join("\n")
                    ),
                    source: "local-placeholder".to_owned(),
                    fallback_reason: Some(format!(
                        "Provider 调用失败（{label}）：{error}。已生成本地占位候选稿。"
                    )),
                    usage: None,
                    diagnostics: Default::default(),
                };
            }
        }
    }

    CandidateGenerationResult {
        content: format!(
            "# 第 {chapter_id} 章候选稿\n\n根据写作任务书 `{}` 生成。\n\n{}",
            brief.relative_path,
            brief.content.lines().take(8).collect::<Vec<_>>().join("\n")
        ),
        source: "local-placeholder".to_owned(),
        fallback_reason: Some("没有启用的 Provider，已生成本地占位候选稿。".to_owned()),
        usage: None,
        diagnostics: Default::default(),
    }
}

pub(crate) fn backup_existing_candidate(root: &Path, chapter_id: &str) -> Result<(), ProjectError> {
    let source = ensure_project_path(root, &format!("manuscript/candidates/{chapter_id}.md"))?;
    if !source.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&source)?;
    if content.trim().is_empty() {
        return Ok(());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let target = ensure_project_path(
        root,
        &format!("manuscript/candidates/history/{chapter_id}/v{timestamp}.md"),
    )?;
    atomic_write_text(&target, &content)?;
    let previous_manifest = read_current_candidate_manifest(root, chapter_id)?;
    let previous_confirmation_path = previous_manifest
        .as_ref()
        .and_then(|item| item.confirmation_path.clone());
    let previous_confirmation_entry_id = previous_manifest
        .as_ref()
        .and_then(|item| item.confirmation_entry_id.clone());
    let history_manifest_path =
        format!("manuscript/candidates/history/{chapter_id}/v{timestamp}.json");
    write_candidate_history_manifest(root, chapter_id, timestamp, previous_manifest)?;
    if let Some(confirmation_path) = previous_confirmation_path {
        backfill_candidate_confirmation_history_manifest(
            root,
            chapter_id,
            previous_confirmation_entry_id.as_deref(),
            &confirmation_path,
            &history_manifest_path,
        )?;
    }
    Ok(())
}

pub(crate) fn write_candidate_history_manifest(
    root: &Path,
    chapter_id: &str,
    backup_time_ms: u128,
    previous_manifest: Option<CandidateHistoryManifest>,
) -> Result<(), ProjectError> {
    let manifest = CandidateHistoryManifest {
        chapter_id: chapter_id.to_owned(),
        backup_time_ms,
        candidate_path: previous_manifest
            .as_ref()
            .map(|item| item.candidate_path.clone())
            .unwrap_or_else(|| format!("manuscript/candidates/{chapter_id}.md")),
        history_path: format!("manuscript/candidates/history/{chapter_id}/v{backup_time_ms}.md"),
        writing_brief_path: previous_manifest
            .as_ref()
            .map(|item| item.writing_brief_path.clone())
            .unwrap_or_else(|| format!("tasks/writing-briefs/{chapter_id}.md")),
        revision_path: previous_manifest
            .as_ref()
            .map(|item| item.revision_path.clone())
            .unwrap_or_else(|| format!("tasks/contract-revisions/{chapter_id}.md")),
        review_path: previous_manifest
            .as_ref()
            .map(|item| item.review_path.clone())
            .unwrap_or_else(|| format!("manuscript/candidates/reviews/{chapter_id}.md")),
        model_call_log_path: previous_manifest
            .as_ref()
            .map(|item| item.model_call_log_path.clone())
            .unwrap_or_else(|| "logs/model-calls/history.md".to_owned()),
        model_call_log_entry_id: previous_manifest
            .as_ref()
            .and_then(|item| item.model_call_log_entry_id.clone()),
        adoption_status: previous_manifest
            .as_ref()
            .and_then(|item| item.adoption_status.clone()),
        adoption_mode: previous_manifest
            .as_ref()
            .and_then(|item| item.adoption_mode.clone()),
        confirmation_path: previous_manifest
            .as_ref()
            .and_then(|item| item.confirmation_path.clone()),
        confirmation_entry_id: previous_manifest
            .as_ref()
            .and_then(|item| item.confirmation_entry_id.clone()),
        restored_from_history_path: previous_manifest
            .as_ref()
            .and_then(|item| item.restored_from_history_path.clone()),
        restored_from_confirmation_path: previous_manifest
            .as_ref()
            .and_then(|item| item.restored_from_confirmation_path.clone()),
        restored_from_confirmation_entry_id: previous_manifest
            .as_ref()
            .and_then(|item| item.restored_from_confirmation_entry_id.clone()),
        restored_at_ms: previous_manifest
            .as_ref()
            .and_then(|item| item.restored_at_ms),
    };
    let target = ensure_project_path(
        root,
        &format!("manuscript/candidates/history/{chapter_id}/v{backup_time_ms}.json"),
    )?;
    atomic_write_text(
        &target,
        &format!("{}\n", serde_json::to_string_pretty(&manifest)?),
    )?;
    Ok(())
}

pub(crate) fn write_current_candidate_manifest(
    root: &Path,
    chapter_id: &str,
    writing_brief_path: &str,
    review_path: &str,
    model_call_log_entry_id: Option<String>,
    restored_from_history_path: Option<String>,
    restored_from_confirmation_path: Option<String>,
    restored_from_confirmation_entry_id: Option<String>,
) -> Result<(), ProjectError> {
    let restored_at_ms = restored_from_history_path.as_ref().map(|_| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default()
    });
    let manifest = CandidateHistoryManifest {
        chapter_id: chapter_id.to_owned(),
        backup_time_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default(),
        candidate_path: format!("manuscript/candidates/{chapter_id}.md"),
        history_path: format!("manuscript/candidates/{chapter_id}.md"),
        writing_brief_path: writing_brief_path.to_owned(),
        revision_path: format!("tasks/contract-revisions/{chapter_id}.md"),
        review_path: review_path.to_owned(),
        model_call_log_path: "logs/model-calls/history.md".to_owned(),
        model_call_log_entry_id,
        adoption_status: None,
        adoption_mode: None,
        confirmation_path: None,
        confirmation_entry_id: None,
        restored_from_history_path,
        restored_from_confirmation_path,
        restored_from_confirmation_entry_id,
        restored_at_ms,
    };
    let target = ensure_project_path(root, &format!("manuscript/candidates/{chapter_id}.json"))?;
    atomic_write_text(
        &target,
        &format!("{}\n", serde_json::to_string_pretty(&manifest)?),
    )?;
    Ok(())
}

pub(crate) fn read_current_candidate_manifest(
    root: &Path,
    chapter_id: &str,
) -> Result<Option<CandidateHistoryManifest>, ProjectError> {
    let path = ensure_project_path(root, &format!("manuscript/candidates/{chapter_id}.json"))?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    Ok(Some(serde_json::from_str(&content)?))
}

pub(crate) fn update_current_candidate_adoption_manifest(
    root: &Path,
    chapter_id: &str,
    mode: &str,
    confirmation_path: &str,
    confirmation_entry_id: &str,
) -> Result<(), ProjectError> {
    let mut manifest =
        read_current_candidate_manifest(root, chapter_id)?.unwrap_or(CandidateHistoryManifest {
            chapter_id: chapter_id.to_owned(),
            backup_time_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or_default(),
            candidate_path: format!("manuscript/candidates/{chapter_id}.md"),
            history_path: format!("manuscript/candidates/{chapter_id}.md"),
            writing_brief_path: format!("tasks/writing-briefs/{chapter_id}.md"),
            revision_path: format!("tasks/contract-revisions/{chapter_id}.md"),
            review_path: format!("manuscript/candidates/reviews/{chapter_id}.md"),
            model_call_log_path: "logs/model-calls/history.md".to_owned(),
            model_call_log_entry_id: None,
            adoption_status: None,
            adoption_mode: None,
            confirmation_path: None,
            confirmation_entry_id: None,
            restored_from_history_path: None,
            restored_from_confirmation_path: None,
            restored_from_confirmation_entry_id: None,
            restored_at_ms: None,
        });
    manifest.adoption_status = Some(if mode.starts_with("undo-") {
        "undone".to_owned()
    } else {
        "adopted".to_owned()
    });
    manifest.adoption_mode = Some(mode.to_owned());
    manifest.confirmation_path = Some(confirmation_path.to_owned());
    manifest.confirmation_entry_id = Some(confirmation_entry_id.to_owned());
    let target = ensure_project_path(root, &format!("manuscript/candidates/{chapter_id}.json"))?;
    atomic_write_text(
        &target,
        &format!("{}\n", serde_json::to_string_pretty(&manifest)?),
    )?;
    Ok(())
}

pub(crate) fn append_candidate_confirmation_index(
    root: &Path,
    chapter_id: &str,
    entry_id: &str,
    created_at_ms: u128,
    mode: &str,
    candidate_path: &str,
    manuscript_path: &str,
    confirmation_path: &str,
    latest_confirmation_path: &str,
) -> Result<(), ProjectError> {
    let index_path = format!("logs/confirmations/{chapter_id}/index.json");
    let index_target = ensure_project_path(root, &index_path)?;
    let mut index = if index_target.exists() {
        let content = fs::read_to_string(&index_target)?;
        serde_json::from_str(&content)?
    } else {
        CandidateConfirmationIndex {
            chapter_id: chapter_id.to_owned(),
            latest_confirmation_path: latest_confirmation_path.to_owned(),
            entries: Vec::new(),
        }
    };
    index.chapter_id = chapter_id.to_owned();
    index.latest_confirmation_path = latest_confirmation_path.to_owned();
    index.entries.push(CandidateConfirmationIndexEntry {
        entry_id: Some(entry_id.to_owned()),
        created_at_ms,
        adoption_status: if mode.starts_with("undo-") {
            "undone".to_owned()
        } else {
            "adopted".to_owned()
        },
        adoption_mode: mode.to_owned(),
        candidate_path: candidate_path.to_owned(),
        current_candidate_manifest_path: Some(format!("manuscript/candidates/{chapter_id}.json")),
        candidate_history_manifest_path: None,
        manuscript_path: manuscript_path.to_owned(),
        confirmation_path: confirmation_path.to_owned(),
        latest_confirmation_path: latest_confirmation_path.to_owned(),
    });
    index.entries.sort_by_key(|entry| entry.created_at_ms);
    atomic_write_text(
        &index_target,
        &format!("{}\n", serde_json::to_string_pretty(&index)?),
    )?;
    Ok(())
}

pub(crate) fn backfill_candidate_confirmation_history_manifest(
    root: &Path,
    chapter_id: &str,
    confirmation_entry_id: Option<&str>,
    confirmation_path: &str,
    candidate_history_manifest_path: &str,
) -> Result<(), ProjectError> {
    let index_path = format!("logs/confirmations/{chapter_id}/index.json");
    let index_target = ensure_project_path(root, &index_path)?;
    if !index_target.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&index_target)?;
    let mut index: CandidateConfirmationIndex = serde_json::from_str(&content)?;
    let mut changed = false;
    for entry in &mut index.entries {
        let matches_entry_id = confirmation_entry_id
            .map(|id| entry.entry_id.as_deref() == Some(id))
            .unwrap_or(false);
        if matches_entry_id || entry.confirmation_path == confirmation_path {
            entry.candidate_history_manifest_path =
                Some(candidate_history_manifest_path.to_owned());
            changed = true;
        }
    }

    if changed {
        atomic_write_text(
            &index_target,
            &format!("{}\n", serde_json::to_string_pretty(&index)?),
        )?;
    }
    Ok(())
}

pub(crate) fn read_candidate_history_manifest(
    history_path: &Path,
) -> Result<Option<CandidateHistoryManifest>, ProjectError> {
    let manifest_path = history_path.with_extension("json");
    if !manifest_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(manifest_path)?;
    Ok(Some(serde_json::from_str(&content)?))
}

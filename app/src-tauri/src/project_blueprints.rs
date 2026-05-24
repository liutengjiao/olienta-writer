use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_ai_providers::{
    append_model_call_log, call_openai_compatible_with_system, provider_label,
    select_provider_for_use_case, ModelCallLog,
};
use crate::project_core::{
    load_chapter_side_file, normalize_chapter_id, read_framework_files, read_optional_project_file,
    read_project_yaml, save_chapter_side_file, write_author_visible_blueprint,
};
use crate::project_events::{append_system_event, append_workflow_task_history};
use crate::project_model::{load_chapter, rescan_facts_for_root, DraftGenerationResult};
use crate::project_skills::read_selected_skills_for_task;
use crate::project_types::{BlueprintHistorySummary, ProjectError, ProjectFileDocument};

pub fn load_blueprint(
    root_path: String,
    chapter_id: String,
) -> Result<ProjectFileDocument, ProjectError> {
    load_chapter_side_file(root_path, chapter_id, "blueprints/chapters")
}

pub fn save_blueprint(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(&root_path);
    let id = normalize_chapter_id(&chapter_id);
    backup_existing_blueprint(&root, &id)?;
    let saved = save_chapter_side_file(
        root_path,
        id.clone(),
        "blueprints/chapters",
        content.clone(),
    )?;
    write_author_visible_blueprint(&root, &id, &content)?;
    cascade_following_blueprints(&root, &id)?;
    rescan_facts_for_root(&root)?;
    append_workflow_task_history(
        &root,
        "blueprint_saved",
        "done",
        serde_json::json!({
            "chapterId": id,
            "path": saved.relative_path,
            "cascade": "following",
            "factsPath": "facts/confirmed-facts.md"
        }),
    )?;
    append_workflow_task_history(
        &root,
        "blueprint_fact_memory_updated",
        "done",
        serde_json::json!({
            "chapterId": id,
            "blueprintPath": saved.relative_path,
            "factsPath": "facts/confirmed-facts.md",
            "sourcePriority": "manuscript-over-blueprint"
        }),
    )?;
    Ok(saved)
}

pub fn generate_blueprint_draft(
    root_path: String,
    chapter_id: String,
    author_input: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("blueprints/chapters/{id}.md");
    let current_blueprint = read_optional_project_file(&root, &relative_path)?;
    let chapter = load_chapter(root.to_string_lossy().to_string(), id.clone())?;
    let chapter_author_input =
        read_optional_project_file(&root, &format!("manuscript/author-input/{id}.md"))?;
    let confirmed_facts = read_optional_project_file(&root, "facts/confirmed-facts.md")?;
    let author_confirmation = read_optional_project_file(&root, "facts/author-confirmation.md")?;
    let open_loops = read_optional_project_file(&root, "facts/open-loops.md")?;
    let framework = read_framework_files(&root)?;
    let skills = read_selected_skills_for_task(&root, "blueprint")?;
    let prompt = compose_blueprint_prompt(
        &id,
        &chapter.content,
        &author_input,
        &chapter_author_input,
        &current_blueprint,
        &confirmed_facts,
        &author_confirmation,
        &open_loops,
        &framework,
        &skills,
    );

    let started_at = Instant::now();
    let generation = match select_provider_for_use_case(&root, &["blueprint"]) {
        Ok(Some(provider)) => {
            let label = provider_label(&provider);
            match call_openai_compatible_with_system(
                &provider,
                "你是 Olienta 的章节蓝图 Agent。只输出当前章蓝图 Markdown 草案。不得保存，不得写正文，不得提前释放后续高潮。",
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
                    content: local_blueprint_draft(
                        &id,
                        &author_input,
                        Some(format!("Provider 返回空内容（{label}）")),
                    ),
                    source: "local-placeholder".to_owned(),
                    fallback_reason: Some(format!("Provider 返回空内容（{label}）")),
                    usage: None,
                    diagnostics: Default::default(),
                },
                Err(error) => DraftGenerationResult {
                    content: local_blueprint_draft(
                        &id,
                        &author_input,
                        Some(format!("Provider 调用失败（{label}）：{error}")),
                    ),
                    source: "local-placeholder".to_owned(),
                    fallback_reason: Some(format!("Provider 调用失败（{label}）：{error}")),
                    usage: None,
                    diagnostics: Default::default(),
                },
            }
        }
        Ok(None) => DraftGenerationResult {
            content: local_blueprint_draft(
                &id,
                &author_input,
                Some("没有可用的 blueprint Provider".to_owned()),
            ),
            source: "local-placeholder".to_owned(),
            fallback_reason: Some("没有可用的 blueprint Provider".to_owned()),
            usage: None,
            diagnostics: Default::default(),
        },
        Err(error) => DraftGenerationResult {
            content: local_blueprint_draft(&id, &author_input, Some(error.to_string())),
            source: "local-placeholder".to_owned(),
            fallback_reason: Some(error.to_string()),
            usage: None,
            diagnostics: Default::default(),
        },
    };

    append_model_call_log(
        &root,
        ModelCallLog {
            task: "blueprint-draft",
            chapter_id: Some(&id),
            provider: &generation.source,
            input_path: Some("framework/ + facts/ + manuscript/author-input/当前章.md"),
            output_path: Some(&relative_path),
            ok: true,
            duration_ms: Some(started_at.elapsed().as_millis()),
            usage: generation.usage,
            diagnostics: Some(&generation.diagnostics),
            message: generation.fallback_reason.as_deref().unwrap_or(
                "Blueprint draft generated into editor area; not saved as official blueprint yet.",
            ),
        },
    )?;
    Ok(ProjectFileDocument {
        relative_path,
        content: generation.content,
    })
}

pub fn regenerate_following_blueprints(
    root_path: String,
    chapter_id: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    cascade_following_blueprints(&root, &id)?;
    load_blueprint(root.to_string_lossy().to_string(), id)
}

pub fn regenerate_all_blueprints(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let project = read_project_yaml(&root)?;
    let mut overwritten = Vec::new();

    for chapter in 1..=project.chapter_count {
        let id = format!("{chapter:03}");
        backup_existing_blueprint(&root, &id)?;
        let target = ensure_project_path(&root, &format!("blueprints/chapters/{id}.md"))?;
        let content = following_blueprint_template(chapter, "all");
        atomic_write_text(&target, &content)?;
        overwritten.push(id);
    }

    write_blueprint_cascade_log(&root, "全部章节", &overwritten)?;
    load_blueprint(root.to_string_lossy().to_string(), "001".to_owned())
}

pub fn list_blueprint_history(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<BlueprintHistorySummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let history_dir = ensure_project_path(&root, &format!("blueprints/history/{id}"))?;
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

        items.push(BlueprintHistorySummary {
            name: file_name.clone(),
            relative_path: format!("blueprints/history/{id}/{file_name}"),
            bytes: metadata.len(),
            backup_time_ms: None,
            candidate_path: None,
            writing_brief_path: None,
            revision_path: None,
            review_path: None,
            model_call_log_path: None,
            model_call_log_entry_id: None,
            adoption_status: None,
            adoption_mode: None,
            confirmation_path: None,
            confirmation_entry_id: None,
            restored_from_history_path: None,
            restored_from_confirmation_path: None,
            restored_from_confirmation_entry_id: None,
            restored_at_ms: None,
            manifest_path: None,
        });
    }

    items.sort_by(|left, right| right.name.cmp(&left.name));
    Ok(items)
}

pub fn load_blueprint_history(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let normalized = relative_path.replace('\\', "/");
    if !normalized.starts_with("blueprints/history/") || !normalized.ends_with(".md") {
        return Err(ProjectError::InvalidInput(
            "blueprint history path must stay inside blueprints/history".to_owned(),
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

pub(crate) fn compose_blueprint_prompt(
    chapter_id: &str,
    chapter_content: &str,
    author_input: &str,
    chapter_author_input: &str,
    current_blueprint: &str,
    confirmed_facts: &str,
    author_confirmation: &str,
    open_loops: &str,
    framework: &str,
    skills: &str,
) -> String {
    format!(
        "# 章节蓝图改写任务\n\n         目标章节：{chapter_id}\n\n         ## 要求\n         1. 只输出章节蓝图 Markdown，不要输出 JSON。\n         2. 明确本章目标、必须发生、禁止提前、伏笔安排和写作提示。\n         3. 尊重已确认正文、事实库和作者确认链。\n         4. 不要提前解决后续章节的冲突或谜题。\n         5. 如果当前正文已有内容，请围绕正文修正蓝图，不要推翻作者确认内容。\n\n         ## 当前正文\n\n{chapter_content}\n\n         ## 全局作者输入\n\n{author_input}\n\n         ## 本章作者输入\n\n{chapter_author_input}\n\n         ## 当前蓝图\n\n{current_blueprint}\n\n         ## 作者确认链\n\n{author_confirmation}\n\n         ## 已确认事实\n\n{confirmed_facts}\n\n         ## 未闭合伏笔\n\n{open_loops}\n\n         ## 框架参考\n\n{framework}\n\n         ## 本次蓝图生成应遵守的 Skill\n\n{skills}\n\n         请输出更新后的章节蓝图。"
    )
}

pub(crate) fn local_blueprint_draft(
    chapter_id: &str,
    author_input: &str,
    fallback_reason: Option<String>,
) -> String {
    let number = chapter_id.parse::<u32>().unwrap_or(1);
    let reason = fallback_reason
        .map(|value| format!("\n\n> 本地草稿原因：{value}"))
        .unwrap_or_default();
    format!(
        "# 第 {number} 章蓝图\n{reason}\n\n         ## 本章目标\n\n         请根据作者输入补齐本章推进目标。\n\n         ## 必须发生\n\n         - 待补充。\n\n         ## 禁止提前\n\n         - 不要提前解决后续章节冲突。\n         - 不要推翻已确认正文和事实库。\n\n         ## 伏笔安排\n\n         - 待确认本章应埋设或推进的伏笔。\n\n         ## 写作提示\n\n         - 保持角色动机、时间线和钉选材料一致。\n\n         ## 作者输入\n\n{}\n\n         ## 待确认\n\n         - 请作者确认本章目标、关键动作和禁区。\n",
        if author_input.trim().is_empty() {
            "暂无作者输入。"
        } else {
            author_input.trim()
        }
    )
}

pub(crate) fn backup_existing_blueprint(root: &Path, chapter_id: &str) -> Result<(), ProjectError> {
    let source = ensure_project_path(root, &format!("blueprints/chapters/{chapter_id}.md"))?;
    if !source.exists() {
        return Ok(());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let target = ensure_project_path(
        root,
        &format!("blueprints/history/{chapter_id}/v{timestamp}.md"),
    )?;
    let content = fs::read_to_string(source)?;
    atomic_write_text(&target, &content)?;
    Ok(())
}

pub(crate) fn cascade_following_blueprints(root: &Path, chapter_id: &str) -> Result<(), ProjectError> {
    let project = read_project_yaml(root)?;
    let start = chapter_id.parse::<u32>().unwrap_or(1);
    if start >= project.chapter_count {
        write_blueprint_cascade_log(root, chapter_id, &[])?;
        return Ok(());
    }

    let mut overwritten = Vec::new();
    for chapter in (start + 1)..=project.chapter_count {
        let id = format!("{chapter:03}");
        backup_existing_blueprint(root, &id)?;
        let target = ensure_project_path(root, &format!("blueprints/chapters/{id}.md"))?;
        let content = following_blueprint_template(chapter, chapter_id);
        atomic_write_text(&target, &content)?;
        overwritten.push(id);
    }

    write_blueprint_cascade_log(root, chapter_id, &overwritten)?;
    Ok(())
}

pub(crate) fn following_blueprint_template(chapter: u32, source_chapter_id: &str) -> String {
    let source_label = if source_chapter_id == "000" {
        "前置章节".to_owned()
    } else {
        format!("第 {source_chapter_id} 章更新")
    };
    format!(
        "# 第 {chapter} 章蓝图\n\n         ## 级联说明\n\n         因{source_label}，本章蓝图需要重新确认。\n\n         ## 本章目标\n\n         - 待补充。\n\n         ## 必须发生\n\n         - 请根据新的前文状态重新确认。\n         - 不要推翻已确认正文和事实库。\n\n         ## 禁止提前\n\n         - 不要提前解决后续章节冲突。\n\n         ## 写作提示\n\n         请重新装配任务书后再生成候选稿。\n"
    )
}

pub(crate) fn write_blueprint_cascade_log(
    root: &Path,
    chapter_id: &str,
    overwritten: &[String],
) -> Result<(), ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let body = if overwritten.is_empty() {
        "没有需要级联覆盖的后续蓝图。".to_owned()
    } else {
        format!("已覆盖后续章节蓝图：{}。", overwritten.join("、"))
    };
    let target = ensure_project_path(root, "blueprints/history/last-cascade.md")?;
    atomic_write_text(
        &target,
        &format!(
            "# 蓝图级联记录\n\n- 来源章节：{chapter_id}\n- 时间戳：{timestamp}\n- 结果：{body}\n"
        ),
    )?;
    append_system_event(
        root,
        "blueprint_cascade",
        serde_json::json!({
            "sourceChapterId": chapter_id,
            "overwritten": overwritten,
            "message": body
        }),
    )?;
    Ok(())
}

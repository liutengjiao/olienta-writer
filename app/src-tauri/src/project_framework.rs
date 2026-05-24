use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_ai_providers::{
    append_model_call_log, call_openai_compatible_with_system, provider_label,
    select_provider_for_use_case, ModelCallLog,
};
use crate::project_events::append_workflow_task_history;
use crate::project_model::{
    mirror_author_visible_framework_file, read_optional_project_file,
    write_generation_context_snapshot, DraftGenerationResult, FrameworkFileSummary, ProjectError,
    ProjectFileDocument,
};
use crate::project_skills::read_selected_skills_for_task;

pub fn list_framework_files(root_path: String) -> Result<Vec<FrameworkFileSummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let framework_dir = ensure_project_path(&root, "framework")?;
    let mut files = Vec::new();

    if framework_dir.exists() {
        for entry in fs::read_dir(framework_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md")
                .to_owned();
            let id = file_name.trim_end_matches(".md").to_owned();
            files.push(FrameworkFileSummary {
                id,
                name: file_name.clone(),
                relative_path: format!("framework/{file_name}"),
            });
        }
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

pub fn load_framework_file(
    root_path: String,
    file_name: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let safe_name = framework_file_name(&file_name);
    let relative_path = format!("framework/{safe_name}");
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn save_framework_file(
    root_path: String,
    file_name: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let safe_name = framework_file_name(&file_name);
    let relative_path = format!("framework/{safe_name}");
    let path = ensure_project_path(&root, &relative_path)?;
    atomic_write_text(&path, &content)?;
    mirror_author_visible_framework_file(&root, &safe_name, &content)?;
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn generate_framework_draft(
    root_path: String,
    file_name: String,
    author_input: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let safe_name = framework_file_name(&file_name);
    let relative_path = format!("framework/{safe_name}");
    let current_content = read_optional_project_file(&root, &relative_path)?;
    let confirmed_facts = read_optional_project_file(&root, "facts/confirmed-facts.md")?;
    let other_frameworks = read_other_framework_files(&root, &safe_name)?;
    let skills = read_selected_skills_for_task(&root, "framework")?;
    let prompt = compose_framework_prompt(
        &safe_name,
        &author_input,
        &current_content,
        &confirmed_facts,
        &other_frameworks,
        &skills,
    );
    let context_snapshot_path =
        write_generation_context_snapshot(&root, "framework-draft", &relative_path, &prompt)?;

    let started_at = Instant::now();
    let generation = match select_provider_for_use_case(&root, &["framework"]) {
        Ok(Some(provider)) => {
            let label = provider_label(&provider);
            match call_openai_compatible_with_system(
                &provider,
                "你是 Olienta 的框架整理 Agent。只输出可编辑 Markdown 草案。不得声称已经保存，不得覆盖作者意愿。",
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
                    content: local_framework_draft(
                        &safe_name,
                        &author_input,
                        Some(format!("Provider 返回空内容（{label}）")),
                    ),
                    source: "local-placeholder".to_owned(),
                    fallback_reason: Some(format!("Provider 返回空内容（{label}）")),
                    usage: None,
                    diagnostics: Default::default(),
                },
                Err(error) => DraftGenerationResult {
                    content: local_framework_draft(
                        &safe_name,
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
            content: local_framework_draft(
                &safe_name,
                &author_input,
                Some("没有可用的 framework Provider".to_owned()),
            ),
            source: "local-placeholder".to_owned(),
            fallback_reason: Some("没有可用的 framework Provider".to_owned()),
            usage: None,
            diagnostics: Default::default(),
        },
        Err(error) => DraftGenerationResult {
            content: local_framework_draft(&safe_name, &author_input, Some(error.to_string())),
            source: "local-placeholder".to_owned(),
            fallback_reason: Some(error.to_string()),
            usage: None,
            diagnostics: Default::default(),
        },
    };

    let draft_relative_path = write_framework_draft_file(&root, &safe_name, &generation.content)?;

    append_model_call_log(
        &root,
        ModelCallLog {
            task: "framework-draft",
            chapter_id: None,
            provider: &generation.source,
            input_path: Some(&context_snapshot_path),
            output_path: Some(&draft_relative_path),
            ok: true,
            duration_ms: Some(started_at.elapsed().as_millis()),
            usage: generation.usage,
            diagnostics: Some(&generation.diagnostics),
            message: generation.fallback_reason.as_deref().unwrap_or(
                "Framework draft generated and autosaved as a draft; not saved as official framework file yet.",
            ),
        },
    )?;
    append_workflow_task_history(
        &root,
        "framework_draft_generated",
        if generation.fallback_reason.is_some() {
            "failed"
        } else {
            "done"
        },
        serde_json::json!({
            "targetPath": relative_path,
            "draftPath": draft_relative_path.clone(),
            "contextSnapshotPath": context_snapshot_path.clone(),
            "fallbackReason": generation.fallback_reason.clone()
        }),
    )?;

    Ok(ProjectFileDocument {
        relative_path: draft_relative_path,
        content: generation.content,
    })
}

fn write_framework_draft_file(
    root: &Path,
    safe_name: &str,
    content: &str,
) -> Result<String, ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let stem = safe_name.trim_end_matches(".md");
    let relative_path = format!("framework/drafts/{stem}-{timestamp}.md");
    let path = ensure_project_path(root, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write_text(&path, content)?;
    Ok(relative_path)
}


fn framework_file_name(file_name: &str) -> String {
    let name = file_name
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.'))
        .collect::<String>();
    let fallback = if name.is_empty() {
        "01-setting.md".to_owned()
    } else {
        name
    };

    if fallback.ends_with(".md") {
        fallback
    } else {
        format!("{fallback}.md")
    }
}

fn read_other_framework_files(root: &Path, selected_name: &str) -> Result<String, ProjectError> {
    let framework_dir = ensure_project_path(root, "framework")?;
    let mut chunks = Vec::new();

    if framework_dir.exists() {
        for entry in fs::read_dir(framework_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md");
            if name == selected_name {
                continue;
            }

            let content = fs::read_to_string(&path)?;
            chunks.push(format!(
                "### {name}\n\n{}",
                content.lines().take(80).collect::<Vec<_>>().join("\n")
            ));
        }
    }

    chunks.sort();
    Ok(chunks.join("\n\n"))
}

pub(crate) fn compose_framework_prompt(
    file_name: &str,
    author_input: &str,
    current_content: &str,
    confirmed_facts: &str,
    other_frameworks: &str,
    skills: &str,
) -> String {
    format!(
        "# 框架文档改写任务\n\n         目标文件：framework/{file_name}\n\n         ## 要求\n         1. 只输出 Markdown 正文，不要输出 JSON。\n         2. 保留作者输入中的核心设定，不要替作者做无依据改动。\n         3. 与已确认事实和其他框架文件保持一致。\n         4. 内容要可直接保存为 framework/{file_name}。\n\n         ## 作者输入\n\n{author_input}\n\n         ## 当前文件内容\n\n{current_content}\n\n         ## 已确认事实\n\n{confirmed_facts}\n\n         ## 其他框架参考\n\n{other_frameworks}\n\n         ## 本次框架生成应遵守的 Skill\n\n{skills}\n\n         请输出更新后的 framework/{file_name} 内容。"
    )
}

fn local_framework_draft(
    file_name: &str,
    author_input: &str,
    fallback_reason: Option<String>,
) -> String {
    let title = framework_title(file_name);
    let reason = fallback_reason
        .map(|value| format!("\n\n> 本地草稿原因：{value}"))
        .unwrap_or_default();
    format!(
        "# {title}\n{reason}\n\n         ## 作者输入\n\n{}\n\n         ## AI 待补完\n\n         - 请补齐核心设定。\n         - 请保持 Markdown 结构清晰，不要输出 JSON。\n         - 请与已确认正文和事实库保持一致。\n\n         ## 待确认\n         - 核心设定\n         - 角色/冲突边界\n         - 风格约束\n",
        if author_input.trim().is_empty() {
            "暂无作者输入。"
        } else {
            author_input.trim()
        }
    )
}

fn framework_title(file_name: &str) -> &'static str {
    if file_name.contains("premise") {
        "故事梗概"
    } else if file_name.contains("character") {
        "角色设定"
    } else if file_name.contains("plot") {
        "情节结构"
    } else if file_name.contains("world") {
        "世界观"
    } else if file_name.contains("style") {
        "写作风格"
    } else {
        "框架文档"
    }
}


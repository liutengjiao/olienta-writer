use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_model::ProjectError;

pub(crate) fn append_system_event(
    root: &Path,
    kind: &str,
    detail: serde_json::Value,
) -> Result<(), ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_secs();
    let event = serde_json::json!({
        "kind": kind,
        "createdAtUnix": timestamp,
        "detail": detail
    });
    let target = ensure_project_path(root, "logs/system-events.jsonl")?;
    let mut content = fs::read_to_string(&target).unwrap_or_default();
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&serde_json::to_string(&event)?);
    content.push('\n');
    atomic_write_text(&target, &content)?;
    append_task_history(root, kind, "done", event)?;
    Ok(())
}

fn append_task_history(
    root: &Path,
    kind: &str,
    status: &str,
    event: serde_json::Value,
) -> Result<(), ProjectError> {
    append_task_history_record(
        root,
        kind,
        status,
        event
            .get("createdAtUnix")
            .and_then(|value| value.as_u64())
            .unwrap_or_default(),
        event
            .get("detail")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({})),
        "system-events",
    )
}

pub(crate) fn append_workflow_task_history(
    root: &Path,
    kind: &str,
    status: &str,
    detail: serde_json::Value,
) -> Result<(), ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_secs();
    append_task_history_record(root, kind, status, timestamp, detail, "workflow")
}

fn append_task_history_record(
    root: &Path,
    kind: &str,
    status: &str,
    created_at_unix: u64,
    detail: serde_json::Value,
    source: &str,
) -> Result<(), ProjectError> {
    let target = ensure_project_path(root, "tasks/history.jsonl")?;
    let mut content = fs::read_to_string(&target).unwrap_or_default();
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    let history = serde_json::json!({
        "kind": kind,
        "status": status,
        "createdAtUnix": created_at_unix,
        "detail": detail,
        "source": source
    });
    write_current_task_snapshot(root, &history)?;
    content.push_str(&serde_json::to_string(&history)?);
    content.push('\n');
    atomic_write_text(&target, &content)?;
    Ok(())
}

fn write_current_task_snapshot(root: &Path, task: &serde_json::Value) -> Result<(), ProjectError> {
    let current = serde_json::json!([{
        "id": format!(
            "{}-{}",
            task.get("kind").and_then(|value| value.as_str()).unwrap_or("task"),
            task.get("createdAtUnix").and_then(|value| value.as_u64()).unwrap_or_default()
        ),
        "kind": task.get("kind").cloned().unwrap_or_else(|| serde_json::json!("task")),
        "label": task_kind_label(task.get("kind").and_then(|value| value.as_str()).unwrap_or("task")),
        "status": task.get("status").cloned().unwrap_or_else(|| serde_json::json!("done")),
        "createdAtUnix": task.get("createdAtUnix").cloned().unwrap_or_else(|| serde_json::json!(0)),
        "source": task.get("source").cloned().unwrap_or_else(|| serde_json::json!("workflow")),
        "detail": task.get("detail").cloned().unwrap_or_else(|| serde_json::json!({}))
    }]);
    let target = ensure_project_path(root, "tasks/current.json")?;
    atomic_write_text(&target, &(serde_json::to_string_pretty(&current)? + "\n"))?;
    Ok(())
}

fn task_kind_label(kind: &str) -> &'static str {
    match kind {
        "writing_brief_composed" => "装配章节写作任务书",
        "blueprint_saved" => "保存章节蓝图",
        "candidate_draft_generated" => "生成候选稿",
        "candidate_reviewed" => "审查候选稿",
        "candidate_confirmation_summary_written" => "写入候选稿采用确认",
        "character_cards_extracted" => "抽取角色卡",
        "chapter_confirmation_chain_updated" => "更新正文确认链",
        "provider_tested" => "测试 Provider",
        "chapter_saved" => "保存正文",
        "candidate_adopted" => "采用候选稿",
        "facts_rescanned" => "重扫事实库",
        "blueprint_cascade" => "蓝图级联覆盖",
        "export_created" => "导出作品",
        "skill_imported" => "导入 Skill",
        "skill_disabled_changed" => "变更 Skill 启用状态",
        "skill_temporary_changed" => "变更 Skill 临时状态",
        "providers_saved" => "保存 Provider 配置",
        _ => "项目任务",
    }
}

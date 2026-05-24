use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_model::{ProjectError, ProjectFileDocument, TimelineSettings};

pub fn load_timeline_events(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    load_timeline_file(root_path, "timeline/events.md")
}

pub fn save_timeline_events(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    save_timeline_file(root_path, "timeline/events.md", content)
}

pub fn load_timeline_milestones(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    load_timeline_file(root_path, "timeline/milestones.md")
}

pub fn save_timeline_milestones(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    save_timeline_file(root_path, "timeline/milestones.md", content)
}

pub fn load_timeline_settings(root_path: String) -> Result<TimelineSettings, ProjectError> {
    let root = PathBuf::from(root_path);
    let path = ensure_project_path(&root, ".olienta/timeline-settings.json")?;
    let content = fs::read_to_string(path).unwrap_or_default();
    if content.trim().is_empty() {
        return Ok(default_timeline_settings());
    }

    Ok(serde_json::from_str(&content).unwrap_or_else(|_| default_timeline_settings()))
}

pub(crate) fn read_timeline_context(root: &Path) -> Result<String, ProjectError> {
    let events = read_optional_timeline_file(root, "timeline/events.md")?;
    let milestones = read_optional_timeline_file(root, "timeline/milestones.md")?;

    if !timeline_constraints_enabled(root)? {
        return Ok("Timeline Pro 未启用，当前不会进行时间线冲突检查。AI 仍可读取 timeline/events.md 与 timeline/milestones.md。".to_owned());
    }

    let mut chunks = Vec::new();
    if !events.trim().is_empty() {
        chunks.push(format!("## timeline/events.md\n\n{events}"));
    }
    if !milestones.trim().is_empty() {
        chunks.push(format!("## timeline/milestones.md\n\n{milestones}"));
    }

    if chunks.is_empty() {
        Ok("Timeline Pro 已启用，但还没有可用的时间线内容。".to_owned())
    } else {
        Ok(chunks.join("\n\n---\n\n"))
    }
}

#[allow(dead_code)]
pub(crate) fn read_active_timeline_context(root: &Path) -> Result<Option<String>, ProjectError> {
    if timeline_constraints_enabled(root)? {
        Ok(Some(read_timeline_context(root)?))
    } else {
        Ok(None)
    }
}

fn load_timeline_file(
    root_path: String,
    relative_path: &str,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let path = ensure_project_path(&root, relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

fn save_timeline_file(
    root_path: String,
    relative_path: &str,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let path = ensure_project_path(&root, relative_path)?;
    atomic_write_text(&path, &content)?;
    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

fn timeline_constraints_enabled(root: &Path) -> Result<bool, ProjectError> {
    let settings = load_timeline_settings(root.to_string_lossy().to_string())?;
    Ok(settings.enabled && settings.conflict_check)
}

fn read_optional_timeline_file(root: &Path, relative_path: &str) -> Result<String, ProjectError> {
    let path = ensure_project_path(root, relative_path)?;
    Ok(fs::read_to_string(path).unwrap_or_default())
}

fn default_timeline_settings() -> TimelineSettings {
    TimelineSettings {
        enabled: false,
        conflict_check: false,
        storage: "local-folder".to_owned(),
    }
}

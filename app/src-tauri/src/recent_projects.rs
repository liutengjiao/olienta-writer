use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;
use thiserror::Error;

use crate::fs_safety::{atomic_write_text, FsSafetyError};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RecentProject {
    pub name: String,
    pub root_path: String,
}

#[derive(Debug, Error)]
pub enum RecentProjectsError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("filesystem safety error: {0}")]
    FsSafety(#[from] FsSafetyError),
}

pub fn load_recent_projects(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<RecentProject>, RecentProjectsError> {
    let path = recent_projects_path(app_handle)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

pub fn remember_recent_project(
    app_handle: &tauri::AppHandle,
    project: RecentProject,
) -> Result<Vec<RecentProject>, RecentProjectsError> {
    let mut projects = load_recent_projects(app_handle)?;
    projects.retain(|item| item.root_path != project.root_path);
    projects.insert(0, project);
    projects.truncate(12);

    let path = recent_projects_path(app_handle)?;
    atomic_write_text(&path, &(serde_json::to_string_pretty(&projects)? + "\n"))?;
    Ok(projects)
}

fn recent_projects_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, std::io::Error> {
    let mut dir = app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from(".olienta"));
    fs::create_dir_all(&dir)?;
    dir.push("recent-projects.json");
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_project_dedup_keeps_newest_first() {
        let mut projects = vec![
            RecentProject {
                name: "A".to_owned(),
                root_path: "one".to_owned(),
            },
            RecentProject {
                name: "B".to_owned(),
                root_path: "two".to_owned(),
            },
        ];
        let project = RecentProject {
            name: "A2".to_owned(),
            root_path: "one".to_owned(),
        };

        projects.retain(|item| item.root_path != project.root_path);
        projects.insert(0, project);

        assert_eq!(projects[0].name, "A2");
        assert_eq!(projects.len(), 2);
    }
}

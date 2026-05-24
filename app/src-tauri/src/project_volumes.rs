use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_events::append_system_event;
use crate::project_model::{read_project_yaml, ProjectError, ProjectYaml, VolumeInfo};

pub fn load_volumes(root_path: String) -> Result<Vec<VolumeInfo>, ProjectError> {
    let root = PathBuf::from(root_path);
    read_project_volumes(&root)
}

pub fn save_volumes(
    root_path: String,
    volumes: Vec<VolumeInfo>,
) -> Result<Vec<VolumeInfo>, ProjectError> {
    let root = PathBuf::from(root_path);
    let project = read_project_yaml(&root)?;
    let chapter_count = effective_volume_chapter_count(&root, project.chapter_count, &volumes);
    let normalized = normalize_volumes(volumes, chapter_count);
    let path = ensure_project_path(&root, ".olienta/volumes.json")?;
    atomic_write_text(&path, &serde_json::to_string_pretty(&normalized)?)?;
    append_system_event(
        &root,
        "volumes_saved",
        serde_json::json!({
            "path": ".olienta/volumes.json",
            "count": normalized.len()
        }),
    )?;
    Ok(normalized)
}

pub(crate) fn read_project_volumes(root: &Path) -> Result<Vec<VolumeInfo>, ProjectError> {
    let project = read_project_yaml(root)?;
    let path = ensure_project_path(root, ".olienta/volumes.json")?;
    let content = fs::read_to_string(path).unwrap_or_default();
    if content.trim().is_empty() {
        return Ok(default_project_volumes(&project));
    }

    let parsed: Vec<VolumeInfo> = serde_json::from_str(&content)?;
    let chapter_count = effective_volume_chapter_count(root, project.chapter_count, &parsed);
    Ok(normalize_volumes(parsed, chapter_count))
}

pub(crate) fn default_project_volumes(project: &ProjectYaml) -> Vec<VolumeInfo> {
    vec![VolumeInfo {
        id: "volume-1".to_owned(),
        title: "第一卷".to_owned(),
        start_chapter: 1,
        end_chapter: project.chapter_count.max(1),
        summary: String::new(),
    }]
}

pub(crate) fn volume_for_chapter(volumes: &[VolumeInfo], chapter_id: &str) -> Option<VolumeInfo> {
    let chapter = chapter_id.parse::<u32>().ok()?;
    volumes
        .iter()
        .find(|volume| chapter >= volume.start_chapter && chapter <= volume.end_chapter)
        .cloned()
}

fn effective_volume_chapter_count(root: &Path, project_chapter_count: u32, volumes: &[VolumeInfo]) -> u32 {
    let volume_max = volumes
        .iter()
        .map(|volume| volume.start_chapter.max(volume.end_chapter))
        .max()
        .unwrap_or(0);
    let chapter_file_max = max_existing_chapter_id(root);
    project_chapter_count.max(volume_max).max(chapter_file_max).max(1)
}

fn max_existing_chapter_id(root: &Path) -> u32 {
    let chapters_dir = match ensure_project_path(root, "manuscript/chapters") {
        Ok(path) => path,
        Err(_) => return 0,
    };
    let Ok(entries) = fs::read_dir(chapters_dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                return None;
            }
            path.file_stem()
                .and_then(|value| value.to_str())
                .and_then(|stem| stem.parse::<u32>().ok())
        })
        .max()
        .unwrap_or(0)
}

fn normalize_volumes(volumes: Vec<VolumeInfo>, chapter_count: u32) -> Vec<VolumeInfo> {
    let max_chapter = chapter_count.max(1);
    let mut normalized = volumes
        .into_iter()
        .enumerate()
        .filter_map(|(index, volume)| {
            let start = volume.start_chapter.clamp(1, max_chapter);
            let end = volume.end_chapter.clamp(start, max_chapter);
            let title = volume.title.trim();
            if title.is_empty() {
                return None;
            }
            Some(VolumeInfo {
                id: if volume.id.trim().is_empty() {
                    format!("volume-{}", index + 1)
                } else {
                    volume.id.trim().to_owned()
                },
                title: title.to_owned(),
                start_chapter: start,
                end_chapter: end,
                summary: volume.summary.trim().to_owned(),
            })
        })
        .collect::<Vec<_>>();

    normalized.sort_by_key(|volume| (volume.start_chapter, volume.end_chapter));
    normalized
}

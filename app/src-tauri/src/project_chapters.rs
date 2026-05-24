use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_candidate_review::{
    refresh_chapter_story_contract, write_chapter_contract_fulfillment_summary,
};
use crate::project_core::{
    count_words, load_chapter_side_file, normalize_chapter_id, save_chapter_side_file,
    update_author_confirmation, write_author_visible_manuscript, write_chapter_commit,
};
use crate::project_events::{append_system_event, append_workflow_task_history};
use crate::project_export::docx_to_plain_markdown;
use crate::project_knowledge::rescan_facts_for_root;
use crate::project_types::{ChapterDocument, ProjectError, ProjectFileDocument};

pub fn load_chapter(
    root_path: String,
    chapter_id: String,
) -> Result<ChapterDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("manuscript/chapters/{id}.md");
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();

    Ok(ChapterDocument {
        chapter_id: id,
        relative_path,
        word_count: count_words(&content),
        content,
    })
}

pub fn save_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ChapterDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("manuscript/chapters/{id}.md");
    let path = ensure_project_path(&root, &relative_path)?;
    let backup_path = backup_existing_chapter(&root, &id, &content)?;

    atomic_write_text(&path, &content)?;
    write_author_visible_manuscript(&root, &id, &content)?;
    update_author_confirmation(&root)?;
    rescan_facts_for_root(&root)?;
    write_chapter_commit(&root, &id, &content)?;
    refresh_chapter_story_contract(&root, &id)?;
    let contract_fulfillment_path =
        write_chapter_contract_fulfillment_summary(&root, &id, &content)?;
    append_system_event(
        &root,
        "chapter_saved",
        serde_json::json!({
            "chapterId": id,
            "path": relative_path,
            "backupPath": backup_path,
            "wordCount": count_words(&content),
            "contractFulfillmentPath": contract_fulfillment_path
        }),
    )?;
    append_workflow_task_history(
        &root,
        "chapter_confirmation_chain_updated",
        "done",
        serde_json::json!({
            "chapterId": id,
            "manuscriptPath": relative_path,
            "factsPath": "facts/confirmed-facts.md",
            "authorConfirmationPath": "facts/author-confirmation.md",
            "contractFulfillmentPath": contract_fulfillment_path,
            "wordCount": count_words(&content)
        }),
    )?;

    Ok(ChapterDocument {
        chapter_id: id,
        relative_path,
        word_count: count_words(&content),
        content,
    })
}

pub fn import_chapter_markdown(
    root_path: String,
    chapter_id: String,
    source_path: String,
) -> Result<ChapterDocument, ProjectError> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(ProjectError::InvalidInput(
            "要导入的正文文件不存在。".to_owned(),
        ));
    }
    if !source.is_file() {
        return Err(ProjectError::InvalidInput(
            "只能导入单个 Markdown/TXT 文件作为当前章节正文。".to_owned(),
        ));
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown" | "txt") {
        return Err(ProjectError::InvalidInput(
            "当前章节正文只支持导入 .md、.markdown 或 .txt 文件。".to_owned(),
        ));
    }

    let content = fs::read_to_string(&source)?;
    let imported = save_chapter(root_path.clone(), chapter_id.clone(), content)?;
    let root = PathBuf::from(root_path);
    append_system_event(
        &root,
        "chapter_markdown_imported",
        serde_json::json!({
            "chapterId": normalize_chapter_id(&chapter_id),
            "sourcePath": source.to_string_lossy(),
            "path": imported.relative_path,
            "wordCount": imported.word_count
        }),
    )?;
    Ok(imported)
}

pub fn read_imported_document(source_path: String) -> Result<String, ProjectError> {
    let source = PathBuf::from(source_path);
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "md" | "markdown" | "txt" => Ok(fs::read_to_string(&source)?),
        "docx" => docx_to_plain_markdown(&source),
        _ => Err(ProjectError::InvalidInput(
            "仅支持导入 Markdown、TXT 或 DOCX 文件。".to_owned(),
        )),
    }
}

pub fn load_author_input(
    root_path: String,
    chapter_id: String,
) -> Result<ProjectFileDocument, ProjectError> {
    load_chapter_side_file(root_path, chapter_id, "manuscript/author-input")
}

pub fn save_author_input(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    save_chapter_side_file(root_path, chapter_id, "manuscript/author-input", content)
}

fn backup_existing_chapter(
    root: &Path,
    chapter_id: &str,
    next_content: &str,
) -> Result<Option<String>, ProjectError> {
    let source = ensure_project_path(root, &format!("manuscript/chapters/{chapter_id}.md"))?;
    if !source.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&source)?;
    if content.trim().is_empty() || content == next_content {
        return Ok(None);
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let relative_path = format!("manuscript/chapters/history/{chapter_id}/v{timestamp}.md");
    let target = ensure_project_path(root, &relative_path)?;
    atomic_write_text(&target, &content)?;
    Ok(Some(relative_path))
}

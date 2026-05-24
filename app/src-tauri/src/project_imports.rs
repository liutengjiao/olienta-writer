use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_events::append_system_event;
use crate::project_model::{
    DeconstructionImportResult, ImportReferenceBatchResult, ImportedReferenceFile, ProjectError,
    ProjectFileDocument,
};
use crate::project_model::reject_software_directory_project_path;

pub fn import_reference_file(
    root_path: String,
    source_path: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let source = PathBuf::from(source_path);
    if !source.is_file() {
        return Err(ProjectError::InvalidInput(
            "要导入的资料文件不存在。".to_owned(),
        ));
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown" | "txt") {
        return Err(ProjectError::InvalidInput(
            "当前只支持导入 Markdown 或 TXT 资料文件。".to_owned(),
        ));
    }

    let source_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("imported.md");
    let safe_name = imported_reference_file_name(source_name, &extension);
    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    let relative_path = unique_imported_reference_path(&root, &safe_name)?;
    let target = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(&source)?;
    atomic_write_text(&target, &content)?;
    append_system_event(
        &root,
        "reference_file_imported",
        serde_json::json!({
            "sourcePath": source.to_string_lossy().to_string(),
            "path": relative_path.clone()
        }),
    )?;

    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn import_reference_file_with_deconstruction(
    root_path: String,
    source_path: String,
) -> Result<DeconstructionImportResult, ProjectError> {
    let reference = import_reference_file(root_path.clone(), source_path)?;
    let root = PathBuf::from(root_path);
    let deconstruction_path = write_reference_deconstruction(&root, &reference)?;
    let skill_candidate_path =
        write_reference_skill_candidate(&root, &reference, &deconstruction_path)?;
    append_system_event(
        &root,
        "reference_deconstruction_created",
        serde_json::json!({
            "sourcePath": reference.relative_path,
            "deconstructionPath": deconstruction_path,
            "skillCandidatePath": skill_candidate_path
        }),
    )?;
    Ok(DeconstructionImportResult {
        reference,
        deconstruction_path,
        skill_candidate_path,
    })
}

pub fn import_reference_directory(
    root_path: String,
    source_path: String,
) -> Result<ImportReferenceBatchResult, ProjectError> {
    let source_root = PathBuf::from(source_path);
    if !source_root.is_dir() {
        return Err(ProjectError::InvalidInput(
            "要导入的资料文件夹不存在。".to_owned(),
        ));
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    let canonical_root = root.canonicalize().unwrap_or(root.clone());
    let canonical_source = source_root.canonicalize()?;
    if canonical_source.starts_with(&canonical_root) {
        return Err(ProjectError::InvalidInput(
            "不能把当前作品项目自身作为资料文件夹导入。".to_owned(),
        ));
    }

    let mut candidates = Vec::new();
    let mut skipped_count = 0usize;
    collect_reference_import_candidates(
        &canonical_source,
        &canonical_source,
        &mut candidates,
        &mut skipped_count,
    )?;

    let mut imported_files = Vec::new();
    for source in candidates.into_iter().take(500) {
        let relative_source = source
            .strip_prefix(&canonical_source)
            .unwrap_or(&source)
            .to_path_buf();
        let relative_path = imported_reference_path_for_source(&root, &relative_source)?;
        let target = ensure_project_path(&root, &relative_path)?;
        let content = fs::read_to_string(&source)?;
        atomic_write_text(&target, &content)?;
        let bytes = target
            .metadata()
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        imported_files.push(ImportedReferenceFile {
            source_path: source.to_string_lossy().to_string(),
            relative_path,
            bytes,
        });
    }

    append_system_event(
        &root,
        "reference_directory_imported",
        serde_json::json!({
            "sourcePath": canonical_source.to_string_lossy().to_string(),
            "importedCount": imported_files.len(),
            "skippedCount": skipped_count
        }),
    )?;

    Ok(ImportReferenceBatchResult {
        imported_count: imported_files.len(),
        skipped_count,
        imported_files,
    })
}

fn imported_reference_file_name(file_name: &str, extension: &str) -> String {
    let cleaned = file_name
        .chars()
        .filter(|value| {
            !value.is_control()
                && !matches!(value, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
        .collect::<String>();
    let fallback = if cleaned.trim().is_empty() {
        "imported.md".to_owned()
    } else {
        cleaned.trim().to_owned()
    };

    if extension == "markdown" && fallback.ends_with(".markdown") {
        return format!("{}.md", fallback.trim_end_matches(".markdown"));
    }
    fallback
}

fn write_reference_deconstruction(
    root: &Path,
    reference: &ProjectFileDocument,
) -> Result<String, ProjectError> {
    let stem = Path::new(&reference.relative_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("reference");
    let safe_stem = imported_reference_file_name(stem, "md")
        .trim_end_matches(".md")
        .to_owned();
    let relative_path = unique_imported_reference_path_in_dir(
        root,
        "knowledge/markdown/imported/_deconstruction",
        &format!("{safe_stem}-deconstruction.md"),
    )?;
    let profile = analyze_deconstruction_reference(&reference.content);
    let content = format!(
        "# 拆解：{stem}\n\n- 原始资料：`{}`\n- 用途：拆解结果只作为知识库资料和 Skill 候选，不直接改正文。\n\n## 结构观察\n\n{}\n\n## 节奏观察\n\n{}\n\n## 人物与冲突观察\n\n{}\n\n## 可复用技法\n\n{}\n\n## 使用边界\n\n- 只借鉴方法，不复制原文表达。\n- 进入候选稿前仍需经过作者确认链。\n",
        reference.relative_path,
        markdown_lines_or_empty(&profile.structure, "No clear structure signals detected."),
        markdown_lines_or_empty(&profile.pacing, "No clear pacing signals detected."),
        markdown_lines_or_empty(&profile.character, "No clear character/conflict signals detected."),
        markdown_lines_or_empty(&profile.techniques, "No reusable techniques detected."),
    );
    let target = ensure_project_path(root, &relative_path)?;
    atomic_write_text(&target, &content)?;
    Ok(relative_path)
}

fn write_reference_skill_candidate(
    root: &Path,
    reference: &ProjectFileDocument,
    deconstruction_path: &str,
) -> Result<String, ProjectError> {
    let stem = Path::new(&reference.relative_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("reference");
    let safe_stem = imported_reference_file_name(stem, "md")
        .trim_end_matches(".md")
        .to_owned();
    let relative_path = unique_imported_reference_path_in_dir(
        root,
        "knowledge/markdown/imported/_skill-candidates",
        &format!("SKILL_{safe_stem}.md"),
    )?;
    let profile = analyze_deconstruction_reference(&reference.content);
    let content = format!(
        "---\ncategory: novel\nscope: temporary\ntags: [deconstruction, reference, pacing]\n---\n\n# Skill 候选：{stem}\n\n来源资料：`{}`\n拆解文件：`{deconstruction_path}`\n\n## 使用方式\n\n- 这是候选 Skill，不会自动进入 `skills/selected/`。\n- 作者确认后，才可复制或导入为正式 Skill。\n- 使用时只迁移叙事方法，不复用原文句子。\n\n## 写作规则候选\n\n{}\n",
        reference.relative_path,
        markdown_lines_or_empty(&profile.techniques, "Extract concrete writing rules before enabling this skill."),
    );
    let target = ensure_project_path(root, &relative_path)?;
    atomic_write_text(&target, &content)?;
    Ok(relative_path)
}

struct DeconstructionProfile {
    structure: Vec<String>,
    pacing: Vec<String>,
    character: Vec<String>,
    techniques: Vec<String>,
}

fn analyze_deconstruction_reference(content: &str) -> DeconstructionProfile {
    let mut structure = Vec::new();
    let mut pacing = Vec::new();
    let mut character = Vec::new();
    let mut techniques = Vec::new();
    let paragraph_count = content
        .split("\n\n")
        .filter(|paragraph| !paragraph.trim().is_empty())
        .count();
    let unit_count = count_text_units(content);
    let dialogue_lines = content
        .lines()
        .filter(|line| {
            line.contains('"') || line.contains('“') || line.contains('”') || line.contains('：')
        })
        .count();

    structure.push(format!(
        "The sample has about {unit_count} text units and {paragraph_count} paragraphs; use it as a density reference."
    ));
    if content.contains("##") || content.contains("###") {
        structure.push("The sample has explicit heading hierarchy; map it into structural beats or scene beats.".to_owned());
    }
    if content.contains("转折") || content.contains("但是") || content.contains("然而") {
        structure.push("The sample contains reversal markers; compare information before and after the turn.".to_owned());
        techniques.push("Preserve the false assumption before a turn, then overturn it through action or evidence.".to_owned());
    }

    if dialogue_lines > 0 {
        pacing.push(format!(
            "The sample has about {dialogue_lines} dialogue lines; inspect how dialogue carries pressure or information."
        ));
        techniques.push("Let dialogue test, hide, pressure, or expose information; avoid pure explanation.".to_owned());
    } else {
        pacing.push("Dialogue is sparse; inspect how narration keeps forward motion.".to_owned());
    }
    if content.contains("突然") || content.contains("立即") || content.contains("此刻") {
        pacing.push("The sample uses immediate trigger words; inspect how scene pressure enters quickly.".to_owned());
    }

    if content.contains("选择") || content.contains("代价") || content.contains("秘密") {
        character.push("The sample involves choice, cost, or secrets; extract character pressure and hidden motive patterns.".to_owned());
        techniques.push("Bind every key choice to a cost, misjudgment, or relationship change.".to_owned());
    }
    if content.contains("承诺") || content.contains("钥匙") || content.contains("线索") {
        character.push("The sample contains traceable objects, promises, or clues; convert them into open-loop candidates.".to_owned());
        techniques.push("Turn traceable objects into behavioral evidence that can be paid off later.".to_owned());
    }

    if techniques.is_empty() {
        techniques.push("When deconstructing a sample, prioritize structure, pacing, character pressure, and open-loop usage.".to_owned());
    }

    DeconstructionProfile {
        structure,
        pacing,
        character,
        techniques,
    }
}

fn imported_reference_path_for_source(
    root: &Path,
    relative_source: &Path,
) -> Result<String, ProjectError> {
    let mut parts: Vec<String> = relative_source
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => value.to_str().map(sanitize_import_component),
            _ => None,
        })
        .filter(|part| !part.is_empty())
        .collect();

    if parts.is_empty() {
        parts.push("imported.md".to_owned());
    }

    let file_name = parts.pop().unwrap_or_else(|| "imported.md".to_owned());
    let extension = Path::new(&file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md")
        .to_ascii_lowercase();
    let safe_file = imported_reference_file_name(&file_name, &extension);
    let relative_dir = if parts.is_empty() {
        "knowledge/markdown/imported".to_owned()
    } else {
        format!("knowledge/markdown/imported/{}", parts.join("/"))
    };
    unique_imported_reference_path_in_dir(root, &relative_dir, &safe_file)
}

fn sanitize_import_component(value: &str) -> String {
    let cleaned = value
        .chars()
        .filter(|character| {
            !character.is_control()
                && !matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
        })
        .collect::<String>();
    cleaned.trim().to_owned()
}

fn unique_imported_reference_path(root: &Path, safe_name: &str) -> Result<String, ProjectError> {
    unique_imported_reference_path_in_dir(root, "knowledge/markdown/imported", safe_name)
}

fn unique_imported_reference_path_in_dir(
    root: &Path,
    relative_dir: &str,
    safe_name: &str,
) -> Result<String, ProjectError> {
    let base = Path::new(safe_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("imported");
    let extension = Path::new(safe_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md");

    for index in 0..500 {
        let name = if index == 0 {
            format!("{base}.{extension}")
        } else {
            format!("{base}-{index}.{extension}")
        };
        let relative_path = format!("{relative_dir}/{name}");
        let path = ensure_project_path(root, &relative_path)?;
        if !path.exists() {
            return Ok(relative_path);
        }
    }

    Err(ProjectError::InvalidInput(
        "Imported reference files have too many duplicate names; clean the imported folder first."
            .to_owned(),
    ))
}

fn collect_reference_import_candidates(
    root: &Path,
    current: &Path,
    candidates: &mut Vec<PathBuf>,
    skipped_count: &mut usize,
) -> Result<(), ProjectError> {
    if candidates.len() >= 500 {
        return Ok(());
    }

    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if should_skip_reference_import_path(file_name) {
            *skipped_count += 1;
            continue;
        }

        if path.is_dir() {
            collect_reference_import_candidates(root, &path, candidates, skipped_count)?;
            continue;
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if matches!(extension.as_str(), "md" | "markdown" | "txt") {
            candidates.push(path);
        } else {
            *skipped_count += 1;
        }
    }

    candidates.sort_by(|left, right| {
        left.strip_prefix(root)
            .unwrap_or(left)
            .cmp(right.strip_prefix(root).unwrap_or(right))
    });
    Ok(())
}

fn should_skip_reference_import_path(file_name: &str) -> bool {
    matches!(
        file_name,
        "node_modules" | "target" | ".git" | "dist" | ".vite" | ".DS_Store" | "Thumbs.db"
    )
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

fn count_text_units(content: &str) -> usize {
    content
        .chars()
        .filter(|value| !value.is_whitespace())
        .count()
}

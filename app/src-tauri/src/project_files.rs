use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_model::{
    MarkdownFileSummary, ProjectError, ProjectFileDocument, ProjectSearchResult, ProjectVaultEntry,
};

pub fn list_project_markdown_files(
    root_path: String,
) -> Result<Vec<MarkdownFileSummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let mut files = Vec::new();
    collect_markdown_files(&root, &root, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

pub fn list_project_vault_entries(
    root_path: String,
) -> Result<Vec<ProjectVaultEntry>, ProjectError> {
    let root = PathBuf::from(root_path);
    let mut entries = Vec::new();
    collect_project_vault_entries(&root, &root, &mut entries)?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(entries)
}

pub fn load_project_markdown_file(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, ProjectError> {
    if !is_previewable_project_text(&relative_path) {
        return Err(ProjectError::InvalidInput(
            "只能读取项目内 Markdown、JSON、JSONL 或 TXT 文件。".to_owned(),
        ));
    }

    let root = PathBuf::from(root_path);
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn search_project_text_files(
    root_path: String,
    query: String,
) -> Result<Vec<ProjectSearchResult>, ProjectError> {
    search_project_text_files_scoped(root_path, query, "all".to_owned())
}

pub fn search_project_text_files_scoped(
    root_path: String,
    query: String,
    scope: String,
) -> Result<Vec<ProjectSearchResult>, ProjectError> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }
    let query_terms = search_query_terms(&normalized_query);

    let normalized_scope = normalize_search_scope(&scope)?;
    let root = PathBuf::from(root_path);
    let mut files = Vec::new();
    collect_markdown_files(&root, &root, &mut files)?;
    files.retain(|file| {
        search_scope_matches(&normalized_scope, &file.relative_path, &file.category)
    });
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let mut ranked_results = Vec::new();
    for file in files {
        if file.bytes > 1_200_000 {
            continue;
        }

        let path = ensure_project_path(&root, &file.relative_path)?;
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };

        for (index, line) in content.lines().enumerate() {
            let clean = line.trim();
            if clean.is_empty() {
                continue;
            }
            let normalized_line = clean.to_lowercase();
            let score = search_line_score(&normalized_line, &normalized_query, &query_terms);
            if score == 0 {
                continue;
            }

            ranked_results.push((
                score + search_file_category_boost(&normalized_scope, &file.relative_path),
                ProjectSearchResult {
                    category: file.category.clone(),
                    relative_path: file.relative_path.clone(),
                    line_number: index + 1,
                    snippet: make_search_snippet(clean, &normalized_query),
                },
            ));
        }
    }

    ranked_results.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.relative_path.cmp(&right.1.relative_path))
            .then_with(|| left.1.line_number.cmp(&right.1.line_number))
    });
    Ok(ranked_results
        .into_iter()
        .take(120)
        .map(|(_, result)| result)
        .collect())
}

pub fn save_module_markdown_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let normalized = relative_path.replace('\\', "/");
    if !is_editable_module_markdown(&normalized) {
        return Err(ProjectError::InvalidInput(
            "只能保存模块辅助 Markdown 或事实库约束文件；正文、蓝图和故事框架必须走各自的确认流程。"
                .to_owned(),
        ));
    }

    let root = PathBuf::from(root_path);
    let path = ensure_project_path(&root, &normalized)?;
    atomic_write_text(&path, &content)?;
    Ok(ProjectFileDocument {
        relative_path: normalized,
        content,
    })
}

fn collect_markdown_files(
    root: &Path,
    current: &Path,
    files: &mut Vec<MarkdownFileSummary>,
) -> Result<(), ProjectError> {
    if !current.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");

        if should_skip_vault_path(file_name) {
            continue;
        }

        if path.is_dir() {
            collect_markdown_files(root, &path, files)?;
            continue;
        }

        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };

        let extension = extension.to_ascii_lowercase();
        if !matches!(extension.as_str(), "md" | "markdown" | "txt") {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        if !is_author_visible_project_text(&relative_path) {
            continue;
        }
        let bytes = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);

        files.push(MarkdownFileSummary {
            category: markdown_file_category(&relative_path).to_owned(),
            relative_path,
            bytes,
        });
    }

    Ok(())
}

fn is_author_visible_project_text(relative_path: &str) -> bool {
    let path = relative_path.replace('\\', "/");
    let file_name = path.rsplit('/').next().unwrap_or("");
    if matches!(file_name, "README.md" | "INDEX.md") {
        return false;
    }
    if path.starts_with(".olienta/")
        || path.starts_with("skills/")
        || path.starts_with("models/")
        || path.starts_with("rules/")
        || path.starts_with("logs/")
        || path.starts_with("story-contracts/")
        || path.starts_with("knowledge/search/")
    {
        return false;
    }

    path.starts_with("framework/")
        || path.starts_with("blueprints/")
        || path.starts_with("manuscript/")
        || path.starts_with("facts/")
        || path.starts_with("characters/")
        || path.starts_with("timeline/")
        || path.starts_with("tasks/writing-briefs/")
        || path.starts_with("knowledge/markdown/imported/")
        || path.starts_with("exports/")
}

fn collect_project_vault_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<ProjectVaultEntry>,
) -> Result<(), ProjectError> {
    if !current.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");

        if should_skip_vault_path(file_name) {
            continue;
        }

        if path.is_dir() {
            collect_project_vault_entries(root, &path, entries)?;
            continue;
        }

        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        let extension = extension.to_lowercase();
        if !is_project_vault_file_extension(&extension) {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        if !is_author_visible_project_text(&relative_path) {
            continue;
        }
        let bytes = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);

        entries.push(ProjectVaultEntry {
            category: markdown_file_category(&relative_path).to_owned(),
            relative_path,
            bytes,
            readable: matches!(
                extension.as_str(),
                "md" | "markdown" | "json" | "jsonl" | "txt" | "yaml" | "yml"
            ),
            extension,
        });
    }

    Ok(())
}

fn should_skip_vault_path(file_name: &str) -> bool {
    matches!(
        file_name,
        "node_modules" | "target" | ".git" | "dist" | ".vite" | ".DS_Store" | "Thumbs.db"
    )
}

fn is_project_vault_file_extension(extension: &str) -> bool {
    matches!(
        extension,
        "md" | "markdown" | "json" | "jsonl" | "txt" | "yaml" | "yml" | "docx"
    )
}

fn markdown_file_category(relative_path: &str) -> &'static str {
    if relative_path.starts_with("framework/") {
        "故事框架"
    } else if relative_path.starts_with("blueprints/chapters/") {
        "章节蓝图"
    } else if relative_path.starts_with("manuscript/chapters/") {
        "正文"
    } else if relative_path.starts_with("manuscript/candidates/") {
        "候选稿"
    } else if relative_path.starts_with("manuscript/drafts/") {
        "正文草稿"
    } else if relative_path.starts_with("facts/") {
        "事实库"
    } else if relative_path.starts_with("timeline/") {
        "时间轴"
    } else if relative_path.starts_with("characters/") {
        "角色"
    } else if relative_path.starts_with("knowledge/") {
        "知识库"
    } else if relative_path.starts_with("exports/") {
        "导出"
    } else if relative_path.starts_with("tasks/") {
        "任务"
    } else {
        "其它"
    }
}

fn normalize_search_scope(scope: &str) -> Result<String, ProjectError> {
    let normalized = scope.trim().to_ascii_lowercase();
    let value = if normalized.is_empty() {
        "all".to_owned()
    } else {
        normalized
    };

    if matches!(
        value.as_str(),
        "all" | "imported" | "framework" | "manuscript" | "memory"
    ) {
        Ok(value)
    } else {
        Err(ProjectError::InvalidInput("未知检索范围。".to_owned()))
    }
}

fn search_scope_matches(scope: &str, relative_path: &str, category: &str) -> bool {
    match scope {
        "all" => true,
        "imported" => relative_path.starts_with("knowledge/markdown/imported/"),
        "framework" => relative_path.starts_with("framework/") || category == "故事框架",
        "manuscript" => {
            relative_path.starts_with("manuscript/")
                || relative_path.starts_with("blueprints/")
                || matches!(category, "正文" | "正文草稿" | "候选稿" | "章节蓝图")
        }
        "memory" => {
            relative_path.starts_with("facts/")
                || relative_path.starts_with("tasks/writing-briefs/")
                || matches!(category, "事实库" | "任务")
        }
        _ => false,
    }
}

fn search_query_terms(normalized_query: &str) -> Vec<String> {
    normalized_query
        .split(|ch: char| ch.is_whitespace() || matches!(ch, ',' | '，' | ';' | '；' | '|'))
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .map(str::to_owned)
        .collect()
}

fn search_line_score(normalized_line: &str, normalized_query: &str, terms: &[String]) -> usize {
    let mut score = 0;
    if normalized_line.contains(normalized_query) {
        score += 40;
    }
    if terms.is_empty() {
        return score;
    }
    let mut matched_terms = 0;
    for term in terms {
        if normalized_line.contains(term) {
            matched_terms += 1;
            score += 10;
        }
    }
    if matched_terms == terms.len() {
        score += 25;
    }
    if matched_terms >= 2 {
        score += matched_terms * 4;
    }
    score
}

fn search_file_category_boost(scope: &str, relative_path: &str) -> usize {
    match scope {
        "memory" if relative_path.starts_with("facts/") => 12,
        "framework" if relative_path.starts_with("framework/") => 12,
        "manuscript" if relative_path.starts_with("manuscript/chapters/") => 12,
        "imported" if relative_path.starts_with("knowledge/markdown/imported/") => 12,
        _ => 0,
    }
}

fn make_search_snippet(line: &str, normalized_query: &str) -> String {
    let limit = 160;
    let chars: Vec<char> = line.chars().collect();
    if chars.len() <= limit {
        return line.to_owned();
    }

    let lower_line = line.to_lowercase();
    let byte_index = lower_line.find(normalized_query).unwrap_or(0);
    let char_index = line[..byte_index].chars().count();
    let half = limit / 2;
    let start = char_index.saturating_sub(half);
    let end = (start + limit).min(chars.len());
    let mut snippet = chars[start..end].iter().collect::<String>();
    if start > 0 {
        snippet.insert_str(0, "...");
    }
    if end < chars.len() {
        snippet.push_str("...");
    }
    snippet
}

pub(crate) fn is_previewable_project_text(relative_path: &str) -> bool {
    let normalized = relative_path.replace('\\', "/");
    let extension = Path::new(&normalized)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "md" | "markdown" | "json" | "jsonl" | "txt"
    )
}

fn is_editable_module_markdown(relative_path: &str) -> bool {
    if relative_path.starts_with("characters/cards/") && relative_path.ends_with(".md") {
        return true;
    }
    if relative_path.starts_with("tasks/writing-briefs/") && relative_path.ends_with(".md") {
        return true;
    }
    if relative_path.starts_with("资料库/") && relative_path.ends_with(".md") {
        return true;
    }
    if relative_path.starts_with("skills/selected/")
        && (relative_path.ends_with(".md") || relative_path.ends_with(".markdown"))
    {
        return true;
    }

    matches!(
        relative_path,
        "knowledge/README.md"
            | "knowledge/markdown/README.md"
            | "knowledge/search/README.md"
            | "facts/confirmed-facts.md"
            | "facts/character-facts.md"
            | "facts/time-facts.md"
            | "facts/location-facts.md"
            | "facts/relation-facts.md"
            | "facts/event-facts.md"
            | "facts/world-rules.md"
            | "facts/open-loops.md"
            | "facts/forbidden-rules.md"
            | "characters/cards/README.md"
            | "characters/relations.md"
            | "characters/growth.md"
            | "logs/author-confirmation.md"
            | "logs/model-calls/README.md"
            | "logs/model-calls/history.md"
            | "models/README.md"
    )
}

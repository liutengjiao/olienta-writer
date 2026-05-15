use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::fs_safety::{atomic_write_text, ensure_project_path, FsSafetyError};

#[derive(Debug, Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub root_path: String,
    pub language: String,
    pub chapter_count: u32,
    pub target_words_per_chapter: u32,
    pub template: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub name: String,
    pub root_path: String,
    pub language: String,
    pub chapter_count: u32,
}

#[derive(Debug, Serialize)]
pub struct ChapterSummary {
    pub id: String,
    pub title: String,
    pub words: usize,
    pub state: String,
}

#[derive(Debug, Serialize)]
pub struct ChapterDocument {
    pub chapter_id: String,
    pub relative_path: String,
    pub content: String,
    pub word_count: usize,
}

#[derive(Debug, Serialize)]
pub struct ProjectFileDocument {
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ImportedReferenceFile {
    pub source_path: String,
    pub relative_path: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct ImportReferenceBatchResult {
    pub imported_count: usize,
    pub skipped_count: usize,
    pub imported_files: Vec<ImportedReferenceFile>,
}

#[derive(Debug, Serialize)]
pub struct WritingBrief {
    pub chapter_id: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct CandidateDraft {
    pub chapter_id: String,
    pub relative_path: String,
    pub writing_brief_path: String,
    pub review_path: String,
    pub content: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ProviderTestResult {
    pub ok: bool,
    pub provider: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineSettings {
    pub enabled: bool,
    #[serde(rename = "conflictCheck")]
    pub conflict_check: bool,
    pub storage: String,
}

#[derive(Debug, Serialize)]
pub struct MarkdownFileSummary {
    pub category: String,
    pub relative_path: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct ProjectVaultEntry {
    pub category: String,
    pub relative_path: String,
    pub bytes: u64,
    pub extension: String,
    pub readable: bool,
}

#[derive(Debug, Serialize)]
pub struct ProjectHealthItem {
    pub kind: String,
    pub label: String,
    pub relative_path: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectHealthReport {
    pub status: String,
    pub ready: bool,
    pub missing_count: usize,
    pub warning_count: usize,
    pub checks: Vec<ProjectHealthItem>,
}

#[derive(Debug, Serialize)]
pub struct ProjectSearchResult {
    pub category: String,
    pub relative_path: String,
    pub line_number: usize,
    pub snippet: String,
}

#[derive(Debug, Deserialize)]
pub struct PinSearchResultInput {
    pub source_path: String,
    pub line_number: usize,
    pub snippet: String,
}

#[derive(Debug, Serialize)]
pub struct PinnedContextItem {
    pub index: usize,
    pub source_path: String,
    pub line_number: usize,
    pub snippet: String,
}

#[derive(Debug, Serialize)]
pub struct SkillFileSummary {
    pub name: String,
    pub relative_path: String,
    pub bytes: u64,
    pub disabled: bool,
    pub temporary: bool,
}

#[derive(Debug, Serialize)]
pub struct BlueprintHistorySummary {
    pub name: String,
    pub relative_path: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct FrameworkFileSummary {
    pub id: String,
    pub name: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
pub struct ExportInput {
    pub root_path: String,
    pub format: String,
    pub scope: Option<String>,
    pub chapter_id: Option<String>,
    pub chapter_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProviderConfig {
    id: Option<String>,
    name: Option<String>,
    kind: Option<String>,
    enabled: Option<bool>,
    base_url: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    temperature: Option<f32>,
    use_cases: Option<Vec<String>>,
}

struct CandidateGenerationResult {
    content: String,
    source: String,
    fallback_reason: Option<String>,
}

struct ModelCallLog<'a> {
    task: &'a str,
    chapter_id: Option<&'a str>,
    provider: &'a str,
    input_path: Option<&'a str>,
    output_path: Option<&'a str>,
    ok: bool,
    message: &'a str,
}

const CLASSIFIED_FACT_FILES: &[(&str, &str)] = &[
    ("facts/character-facts.md", "角色事实"),
    ("facts/time-facts.md", "时间事实"),
    ("facts/location-facts.md", "地点事实"),
    ("facts/relation-facts.md", "关系事实"),
    ("facts/world-rules.md", "世界规则"),
    ("facts/event-facts.md", "事件事实"),
];

#[derive(Debug, Serialize, Deserialize)]
struct ProjectYaml {
    name: String,
    language: String,
    template: String,
    storage: String,
    chapter_count: u32,
    target_words_per_chapter: u32,
}

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("project name is required")]
    MissingName,
    #[error("project path is required")]
    MissingPath,
    #[error("filesystem safety error: {0}")]
    FsSafety(#[from] FsSafetyError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("yaml error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("invalid input: {0}")]
    InvalidInput(String),
}

pub fn create_project(input: CreateProjectInput) -> Result<ProjectSummary, ProjectError> {
    if input.name.trim().is_empty() {
        return Err(ProjectError::MissingName);
    }
    if input.root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(&input.root_path);
    reject_software_directory_project_path(&root)?;
    fs::create_dir_all(&root)?;

    let project = ProjectYaml {
        name: input.name.trim().to_owned(),
        language: fallback_language(&input.language),
        template: input.template,
        storage: "local-files".to_owned(),
        chapter_count: input.chapter_count.max(1),
        target_words_per_chapter: input.target_words_per_chapter.max(1),
    };

    scaffold_project(&root, &project)?;
    read_summary(&root)
}

pub fn open_project(root_path: String) -> Result<ProjectSummary, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    fs::create_dir_all(&root)?;

    let project = match read_project_yaml(&root) {
        Ok(project) => project,
        Err(_) => ProjectYaml {
            name: root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Untitled Project")
                .to_owned(),
            language: "zh-CN".to_owned(),
            template: "blank".to_owned(),
            storage: "local-files".to_owned(),
            chapter_count: 3,
            target_words_per_chapter: 3000,
        },
    };

    scaffold_project(&root, &project)?;
    read_summary(&root)
}

pub fn list_chapters(root_path: String) -> Result<Vec<ChapterSummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let chapters_dir = ensure_project_path(&root, "manuscript/chapters")?;
    let mut chapters = Vec::new();

    if chapters_dir.exists() {
        for entry in fs::read_dir(chapters_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .map(normalize_chapter_id)
                .unwrap_or_else(|| "001".to_owned());
            let content = fs::read_to_string(&path)?;
            let words = count_words(&content);
            let title = extract_title(&content).unwrap_or_else(|| {
                let number = id.parse::<u32>().unwrap_or(1);
                format!("第{number}章 未命名")
            });
            let state = if is_placeholder_or_empty(&content) {
                "待写".to_owned()
            } else {
                "已确认".to_owned()
            };

            chapters.push(ChapterSummary {
                id,
                title,
                words,
                state,
            });
        }
    }

    chapters.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(chapters)
}

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

    atomic_write_text(&path, &content)?;
    update_author_confirmation(&root)?;
    rescan_facts_for_root(&root)?;
    write_chapter_commit(&root, &id, &content)?;
    append_system_event(
        &root,
        "chapter_saved",
        serde_json::json!({
            "chapterId": id,
            "path": relative_path,
            "wordCount": count_words(&content)
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

pub fn load_blueprint(
    root_path: String,
    chapter_id: String,
) -> Result<ProjectFileDocument, ProjectError> {
    load_chapter_side_file(root_path, chapter_id, "blueprints/chapters")
}

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
    let root = PathBuf::from(&root_path);
    let id = normalize_chapter_id(&chapter_id);
    backup_existing_candidate(&root, &id)?;
    let saved = save_chapter_side_file(
        root_path,
        id.clone(),
        "manuscript/candidates",
        content.clone(),
    )?;
    let warnings = review_candidate_with_context(&root, &id, &content)?;
    let review_path = write_candidate_review_report(
        &root,
        &id,
        &saved.relative_path,
        &format!("tasks/writing-briefs/{id}.md"),
        &warnings,
    )?;
    append_workflow_task_history(
        &root,
        "candidate_reviewed",
        "done",
        serde_json::json!({
            "chapterId": id,
            "candidatePath": saved.relative_path,
            "reviewPath": review_path,
            "warningCount": warnings.len()
        }),
    )?;
    Ok(saved)
}

pub fn save_blueprint(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(&root_path);
    let id = normalize_chapter_id(&chapter_id);
    backup_existing_blueprint(&root, &id)?;
    let saved = save_chapter_side_file(root_path, id.clone(), "blueprints/chapters", content)?;
    cascade_following_blueprints(&root, &id)?;
    append_workflow_task_history(
        &root,
        "blueprint_saved",
        "done",
        serde_json::json!({
            "chapterId": id,
            "path": saved.relative_path,
            "cascade": "following"
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
    );

    let content = match select_provider_for_use_case(&root, &["blueprint"]) {
        Ok(Some(provider)) => call_openai_compatible_with_system(
            &provider,
            "你是 Olienta 的章节蓝图 Agent。只输出当前章蓝图 Markdown 草案。不得保存，不得写正文，不得提前释放后续高潮。",
            &prompt,
        )
        .unwrap_or_else(|error| local_blueprint_draft(&id, &author_input, Some(error))),
        Ok(None) => local_blueprint_draft(
            &id,
            &author_input,
            Some("没有可用的 blueprint Provider".to_owned()),
        ),
        Err(error) => local_blueprint_draft(&id, &author_input, Some(error.to_string())),
    };

    append_model_call_log(
        &root,
        ModelCallLog {
            task: "blueprint-draft",
            chapter_id: Some(&id),
            provider: "blueprint-provider-or-local-placeholder",
            input_path: Some("framework/ + facts/ + manuscript/author-input/当前章.md"),
            output_path: Some(&relative_path),
            ok: true,
            message:
                "Blueprint draft generated into editor area; not saved as official blueprint yet.",
        },
    )?;

    Ok(ProjectFileDocument {
        relative_path,
        content,
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

        items.push(BlueprintHistorySummary {
            name: file_name.clone(),
            relative_path: format!("manuscript/candidates/history/{id}/{file_name}"),
            bytes: metadata.len(),
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
    let pinned_context =
        read_optional_project_file(&root, &format!("tasks/pinned-context/{id}.md"))?;
    let skills = read_selected_skills(&root)?;

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
    content.push_str(&format!("## 章节蓝图\n\n{blueprint}\n\n"));
    content.push_str(&format!("## 作者输入\n\n{author_input}\n\n"));
    content.push_str(&format!("## 框架参考\n\n{framework}\n\n"));
    content.push_str(&format!("## 角色上下文\n\n{character_context}\n\n"));
    content.push_str(&format!("## 时间线\n\n{timeline_context}\n\n"));
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

pub fn generate_candidate_draft(
    root_path: String,
    chapter_id: String,
) -> Result<CandidateDraft, ProjectError> {
    let brief = compose_writing_brief(root_path.clone(), chapter_id)?;
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&brief.chapter_id);
    let generation = generate_candidate_content(&root, &id, &brief);
    let mut warnings = review_candidate_with_context(&root, &id, &generation.content)?;
    if let Some(reason) = generation.fallback_reason.as_ref() {
        warnings.push(format!("AI 调用降级：{reason}"));
    }
    warnings.push(format!("生成来源：{}", generation.source));
    warnings.push(format!("写作任务书：{}", brief.relative_path));
    let relative_path = format!("manuscript/candidates/{id}.md");
    backup_existing_candidate(&root, &id)?;
    let target = ensure_project_path(&root, &relative_path)?;
    atomic_write_text(&target, &generation.content)?;
    let review_path =
        write_candidate_review_report(&root, &id, &relative_path, &brief.relative_path, &warnings)?;
    append_model_call_log(
        &root,
        ModelCallLog {
            task: "candidate-draft",
            chapter_id: Some(&id),
            provider: &generation.source,
            input_path: Some(&brief.relative_path),
            output_path: Some(&relative_path),
            ok: true,
            message: generation
                .fallback_reason
                .as_deref()
                .unwrap_or("Candidate draft generated."),
        },
    )?;
    append_workflow_task_history(
        &root,
        "candidate_draft_generated",
        "done",
        serde_json::json!({
            "chapterId": id,
            "inputPath": brief.relative_path,
            "outputPath": relative_path,
            "reviewPath": review_path.clone(),
            "provider": generation.source,
            "warningCount": warnings.len(),
            "fallbackReason": generation.fallback_reason
        }),
    )?;

    Ok(CandidateDraft {
        chapter_id: id,
        relative_path,
        writing_brief_path: brief.relative_path,
        review_path,
        content: generation.content,
        warnings,
    })
}

pub fn review_candidate_draft(content: String) -> Vec<String> {
    review_candidate_content(&content)
}

pub fn review_candidate_draft_for_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<Vec<String>, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    review_candidate_with_context(&root, &id, &content)
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
    let confirmation_path = format!("logs/confirmations/{}.md", id);
    let confirmation_content = format!(
        "# 第 {id} 章候选稿采用确认\n\n\
         - 采用方式：{mode}\n\
         - 候选稿：{candidate_path}\n\
         - 正文文件：{manuscript_path}\n\
         - 事实库：facts/confirmed-facts.md\n\
         - 作者确认记录：facts/author-confirmation.md\n\n\
         ## 确认规则\n\n\
         作者点击采用并保存正文后，本章正文进入作者确认链。后续 AI 生成、改写、续写、蓝图重生成和事实校验，都必须尊重已经保存的正文、事实库和作者确认记录，不得写出对立内容。\n"
    );
    let confirmation_target = ensure_project_path(&root, &confirmation_path)?;
    atomic_write_text(&confirmation_target, &confirmation_content)?;

    append_system_event(
        &root,
        "candidate_adopted",
        serde_json::json!({
            "chapterId": id,
            "mode": mode,
            "candidatePath": candidate_path,
            "manuscriptPath": manuscript_path,
            "confirmationPath": confirmation_path.clone()
        }),
    )?;
    append_workflow_task_history(
        &root,
        "candidate_confirmation_summary_written",
        "done",
        serde_json::json!({
            "chapterId": id,
            "path": confirmation_path.clone()
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

pub fn export_manuscript(input: ExportInput) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(input.root_path);
    let summary = read_summary(&root)?;
    let scope = input.scope.as_deref().unwrap_or("all");
    let normalized_format = input.format.to_ascii_lowercase();
    let (manuscript, target_stem) = if scope == "chapter" {
        let chapter_id = input.chapter_id.as_deref().unwrap_or("001");
        let document = load_chapter(root.to_string_lossy().to_string(), chapter_id.to_owned())?;
        let content = if is_placeholder_or_empty(&document.content) {
            format!("# 第 {chapter_id} 章\n\n")
        } else {
            format!("{}\n", document.content.trim())
        };
        (content, format!("chapter-{}", chapter_id))
    } else if scope == "selected" {
        let selected_ids = input
            .chapter_ids
            .filter(|ids| !ids.is_empty())
            .or_else(|| input.chapter_id.map(|id| vec![id]))
            .unwrap_or_else(|| vec!["001".to_owned()]);
        let chapters = list_chapters(root.to_string_lossy().to_string())?;
        let mut manuscript = format!("# {} 选中章节\n\n", summary.name);
        for chapter in chapters
            .into_iter()
            .filter(|chapter| selected_ids.iter().any(|id| id == &chapter.id))
        {
            let document = load_chapter(root.to_string_lossy().to_string(), chapter.id)?;
            if is_placeholder_or_empty(&document.content) {
                continue;
            }
            manuscript.push_str(document.content.trim());
            manuscript.push_str("\n\n");
        }
        (manuscript, "selected-chapters".to_owned())
    } else {
        let chapters = list_chapters(root.to_string_lossy().to_string())?;
        let mut manuscript = format!("# {}\n\n", summary.name);

        for chapter in chapters {
            let document = load_chapter(root.to_string_lossy().to_string(), chapter.id)?;
            if is_placeholder_or_empty(&document.content) {
                continue;
            }
            manuscript.push_str(document.content.trim());
            manuscript.push_str("\n\n");
        }
        (manuscript, "manuscript".to_owned())
    };

    let exported = match normalized_format.as_str() {
        "txt" => {
            let relative_path = format!("exports/{target_stem}.txt");
            let content = markdown_to_plain_text(&manuscript);
            let target = ensure_project_path(&root, &relative_path)?;
            atomic_write_text(&target, &content)?;
            ProjectFileDocument {
                relative_path,
                content,
            }
        }
        "docx" | "word" => {
            let relative_path = format!("exports/{target_stem}.docx");
            let target = ensure_project_path(&root, &relative_path)?;
            let bytes = markdown_to_docx(&manuscript)?;
            fs::write(&target, bytes)?;
            ProjectFileDocument {
                content: format!("DOCX exported. Binary content is written to {relative_path}."),
                relative_path,
            }
        }
        _ => {
            let relative_path = format!("exports/{target_stem}.md");
            let target = ensure_project_path(&root, &relative_path)?;
            atomic_write_text(&target, &manuscript)?;
            ProjectFileDocument {
                relative_path,
                content: manuscript,
            }
        }
    };
    append_system_event(
        &root,
        "export_created",
        serde_json::json!({
            "format": normalized_format,
            "scope": scope,
            "path": exported.relative_path
        }),
    )?;
    Ok(exported)
}

pub fn load_knowledge_file(
    root_path: String,
    kind: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = knowledge_relative_path(&kind);
    let path = ensure_project_path(&root, relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();

    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

pub fn save_knowledge_file(
    root_path: String,
    kind: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = knowledge_relative_path(&kind);
    let path = ensure_project_path(&root, relative_path)?;
    atomic_write_text(&path, &content)?;

    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

pub fn load_ai_providers(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = ".olienta/ai-providers.json";
    let path = ensure_project_path(&root, relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_else(|_| "[]\n".to_owned());

    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

pub fn save_ai_providers(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let parsed: serde_json::Value = serde_json::from_str(&content)?;
    let provider_summaries = parsed
        .as_array()
        .map(|providers| {
            providers
                .iter()
                .map(|provider| {
                    serde_json::json!({
                        "id": provider.get("id").and_then(|value| value.as_str()).unwrap_or(""),
                        "name": provider.get("name").and_then(|value| value.as_str()).unwrap_or(""),
                        "kind": provider.get("kind").and_then(|value| value.as_str()).unwrap_or(""),
                        "enabled": provider.get("enabled").and_then(|value| value.as_bool()).unwrap_or(true),
                        "model": provider.get("model").and_then(|value| value.as_str()).unwrap_or(""),
                        "useCases": provider.get("useCases").cloned().unwrap_or_else(|| serde_json::json!([])),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let enabled_count = provider_summaries
        .iter()
        .filter(|provider| {
            provider
                .get("enabled")
                .and_then(|value| value.as_bool())
                .unwrap_or(true)
        })
        .count();
    let pretty = serde_json::to_string_pretty(&parsed)?;
    let root = PathBuf::from(root_path);
    let relative_path = ".olienta/ai-providers.json";
    let path = ensure_project_path(&root, relative_path)?;
    atomic_write_text(&path, &(pretty + "\n"))?;
    append_system_event(
        &root,
        "providers_saved",
        serde_json::json!({
            "path": relative_path,
            "count": provider_summaries.len(),
            "enabledCount": enabled_count,
            "providers": provider_summaries
        }),
    )?;

    Ok(ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content,
    })
}

pub fn test_ai_provider(root_path: String) -> Result<ProviderTestResult, ProjectError> {
    let root = PathBuf::from(root_path);
    let result: ProviderTestResult = match select_chapter_provider(&root) {
        Ok(Some(provider)) => {
            let label = provider_label(&provider);
            match call_openai_compatible(&provider, "只回复：Olienta connection ok") {
                Ok(content) => ProviderTestResult {
                    ok: true,
                    provider: label,
                    message: trim_for_status(&content),
                },
                Err(error) => ProviderTestResult {
                    ok: false,
                    provider: label,
                    message: error,
                },
            }
        }
        Ok(None) => ProviderTestResult {
            ok: false,
            provider: "none".to_owned(),
            message: "没有启用的 OpenAI-compatible Provider。".to_owned(),
        },
        Err(error) => ProviderTestResult {
            ok: false,
            provider: "invalid-config".to_owned(),
            message: error.to_string(),
        },
    };
    append_model_call_log(
        &root,
        ModelCallLog {
            task: "provider-test",
            chapter_id: None,
            provider: &result.provider,
            input_path: Some(".olienta/ai-providers.json"),
            output_path: Some("logs/model-calls/history.md"),
            ok: result.ok,
            message: &result.message,
        },
    )?;
    append_workflow_task_history(
        &root,
        "provider_tested",
        if result.ok { "done" } else { "failed" },
        serde_json::json!({
            "provider": result.provider,
            "message": result.message,
            "configPath": ".olienta/ai-providers.json"
        }),
    )?;
    Ok(result)
}

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
    let prompt = compose_framework_prompt(
        &safe_name,
        &author_input,
        &current_content,
        &confirmed_facts,
        &other_frameworks,
    );

    let content = match select_provider_for_use_case(&root, &["framework"]) {
        Ok(Some(provider)) => call_openai_compatible_with_system(
            &provider,
            "你是 Olienta 的框架整理 Agent。只输出可编辑 Markdown 草案。不得声称已经保存，不得覆盖作者意愿。",
            &prompt,
        )
        .unwrap_or_else(|error| local_framework_draft(&safe_name, &author_input, Some(error))),
        Ok(None) => local_framework_draft(
            &safe_name,
            &author_input,
            Some("没有可用的 framework Provider".to_owned()),
        ),
        Err(error) => local_framework_draft(&safe_name, &author_input, Some(error.to_string())),
    };

    append_model_call_log(
        &root,
        ModelCallLog {
            task: "framework-draft",
            chapter_id: None,
            provider: "framework-provider-or-local-placeholder",
            input_path: Some("framework + facts + author input"),
            output_path: Some(&relative_path),
            ok: true,
            message: "Framework draft generated into editor area; not saved as official framework file yet.",
        },
    )?;

    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn load_timeline_events(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = "timeline/events.md".to_owned();
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn save_timeline_events(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let relative_path = "timeline/events.md".to_owned();
    let path = ensure_project_path(&root, &relative_path)?;
    atomic_write_text(&path, &content)?;
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
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

pub fn inspect_project_health(root_path: String) -> Result<ProjectHealthReport, ProjectError> {
    let root = PathBuf::from(root_path);
    let mut checks = Vec::new();

    for (relative_path, label) in required_project_directories() {
        checks.push(inspect_project_path(
            &root,
            relative_path,
            label,
            "directory",
            true,
        ));
    }

    for (relative_path, label) in required_project_files() {
        checks.push(inspect_project_path(
            &root,
            relative_path,
            label,
            "file",
            true,
        ));
    }

    for (relative_path, label) in recommended_project_files() {
        checks.push(inspect_project_path(
            &root,
            relative_path,
            label,
            "file",
            false,
        ));
    }

    let missing_count = checks
        .iter()
        .filter(|item| item.status == "missing" && is_required_check(&item.kind))
        .count();
    let warning_count = checks
        .iter()
        .filter(|item| item.status == "missing" && !is_required_check(&item.kind))
        .count();
    let ready = missing_count == 0;
    let status = if ready && warning_count == 0 {
        "ready"
    } else if ready {
        "warning"
    } else {
        "missing"
    }
    .to_owned();

    Ok(ProjectHealthReport {
        status,
        ready,
        missing_count,
        warning_count,
        checks,
    })
}

pub fn repair_project_structure(root_path: String) -> Result<ProjectHealthReport, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    fs::create_dir_all(&root)?;
    let project = read_project_yaml(&root).unwrap_or_else(|_| fallback_project_yaml(&root));
    scaffold_project(&root, &project)?;
    append_system_event(
        &root,
        "project_structure_repaired",
        serde_json::json!({
            "message": "已修复缺失的项目结构",
            "chapterCount": project.chapter_count
        }),
    )?;
    inspect_project_health(root.to_string_lossy().to_string())
}

pub fn reveal_project_folder(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    if !root.is_dir() {
        return Err(ProjectError::InvalidInput(
            "项目文件夹不存在，无法在文件管理器中打开。".to_owned(),
        ));
    }

    let canonical = root.canonicalize()?;
    launch_file_manager(&canonical)?;
    Ok(ProjectFileDocument {
        relative_path: canonical.to_string_lossy().to_string(),
        content: "已请求操作系统打开项目文件夹。".to_owned(),
    })
}

pub fn reveal_project_path(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }
    if relative_path.trim().is_empty() {
        return reveal_project_folder(root_path);
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    let target = ensure_project_path(&root, &relative_path)?;
    if !target.exists() {
        return Err(ProjectError::InvalidInput(
            "要定位的项目文件不存在。".to_owned(),
        ));
    }

    let canonical = target.canonicalize()?;
    launch_path_in_file_manager(&canonical)?;
    Ok(ProjectFileDocument {
        relative_path: relative_path.replace('\\', "/"),
        content: "已请求操作系统定位项目文件。".to_owned(),
    })
}

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
            "第一版只支持导入 Markdown 或 TXT 资料文件。".to_owned(),
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

    let normalized_scope = normalize_search_scope(&scope)?;
    let root = PathBuf::from(root_path);
    let mut files = Vec::new();
    collect_markdown_files(&root, &root, &mut files)?;
    files.retain(|file| {
        search_scope_matches(&normalized_scope, &file.relative_path, &file.category)
    });
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let mut results = Vec::new();
    for file in files {
        if results.len() >= 120 {
            break;
        }
        if file.bytes > 1_200_000 {
            continue;
        }

        let path = ensure_project_path(&root, &file.relative_path)?;
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };

        for (index, line) in content.lines().enumerate() {
            if results.len() >= 120 {
                break;
            }

            let clean = line.trim();
            if clean.is_empty() || !clean.to_lowercase().contains(&normalized_query) {
                continue;
            }

            results.push(ProjectSearchResult {
                category: file.category.clone(),
                relative_path: file.relative_path.clone(),
                line_number: index + 1,
                snippet: make_search_snippet(clean, &normalized_query),
            });
        }
    }

    Ok(results)
}

pub fn save_module_markdown_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let normalized = relative_path.replace('\\', "/");
    if !is_editable_module_markdown(&normalized) {
        return Err(ProjectError::InvalidInput(
            "只能保存模块辅助 Markdown 或事实库约束文件；正文、蓝图和故事构架必须走各自的确认流程。"
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

pub fn extract_character_cards(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let source_path = "framework/03-characters.md";
    let source = fs::read_to_string(ensure_project_path(&root, source_path)?)?;
    let cards = parse_character_cards_from_framework(&source);

    if cards.is_empty() {
        return Err(ProjectError::InvalidInput(
            "角色图谱里还没有可抽取的角色标题。请先在故事构架 -> 角色图谱中写入角色段落。"
                .to_owned(),
        ));
    }

    fs::create_dir_all(ensure_project_path(&root, "characters/cards")?)?;
    fs::create_dir_all(ensure_project_path(&root, "characters/history")?)?;

    let mut index = String::from("# 角色卡索引\n\n来源：`framework/03-characters.md`\n\n");
    let mut relations = String::from("# 关系图谱\n\n来源：`framework/03-characters.md`\n\n");
    let mut growth = String::from("# 角色成长线\n\n来源：`framework/03-characters.md`\n\n");

    for (index_no, card) in cards.iter().enumerate() {
        let relative_path = format!(
            "characters/cards/{:03}-{}.md",
            index_no + 1,
            safe_character_file_stem(&card.name)
        );
        let content = render_character_card(card, source_path);
        atomic_write_text(&ensure_project_path(&root, &relative_path)?, &content)?;

        index.push_str(&format!(
            "- [{}]({}) - {}\n",
            card.name,
            relative_path,
            card.role_label.as_deref().unwrap_or("pending")
        ));

        relations.push_str(&format!("## {}\n\n", card.name));
        let relation_lines = extract_character_relation_lines(&card.body, &cards, &card.name);
        if relation_lines.is_empty() {
            relations.push_str("- 待作者补充关系、利益、欲望和冲突边界。\n\n");
        } else {
            for line in relation_lines {
                relations.push_str(&format!("- {}\n", line));
            }
            relations.push('\n');
        }

        growth.push_str(&format!("## {}\n\n", card.name));
        let growth_lines = extract_character_growth_lines(&card.body);
        if growth_lines.is_empty() {
            growth.push_str("- 待作者补充角色状态、变化节点和章节位置。\n\n");
        } else {
            for line in growth_lines {
                growth.push_str(&format!("- {}\n", line));
            }
            growth.push('\n');
        }
    }

    atomic_write_text(
        &ensure_project_path(&root, "characters/cards/INDEX.md")?,
        &index,
    )?;
    atomic_write_text(
        &ensure_project_path(&root, "characters/relations.md")?,
        &relations,
    )?;
    atomic_write_text(
        &ensure_project_path(&root, "characters/growth.md")?,
        &growth,
    )?;

    append_system_event(
        &root,
        "character_cards_extracted",
        serde_json::json!({
            "sourcePath": source_path,
            "count": cards.len(),
            "indexPath": "characters/cards/INDEX.md",
            "relationsPath": "characters/relations.md",
            "growthPath": "characters/growth.md"
        }),
    )?;
    append_workflow_task_history(
        &root,
        "character_cards_extracted",
        "done",
        serde_json::json!({
            "sourcePath": source_path,
            "count": cards.len(),
            "indexPath": "characters/cards/INDEX.md"
        }),
    )?;

    Ok(ProjectFileDocument {
        relative_path: "characters/cards/INDEX.md".to_owned(),
        content: index,
    })
}

pub fn rescan_facts(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    rescan_facts_for_root(&root)?;
    append_system_event(
        &root,
        "facts_rescanned",
        serde_json::json!({
            "path": "facts/confirmed-facts.md"
        }),
    )?;
    let relative_path = "facts/confirmed-facts.md".to_owned();
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn list_selected_skills(root_path: String) -> Result<Vec<SkillFileSummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let skills_dir = ensure_project_path(&root, "skills/selected")?;
    let disabled = read_skill_name_list(&root, ".olienta/disabled-skills.json")?;
    let temporary = read_skill_name_list(&root, ".olienta/temporary-skills.json")?;
    let mut skills = Vec::new();

    if skills_dir.exists() {
        for entry in fs::read_dir(skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md")
                .to_owned();
            let bytes = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);
            skills.push(SkillFileSummary {
                name: name.clone(),
                relative_path: format!("skills/selected/{name}"),
                bytes,
                disabled: disabled.contains(&name),
                temporary: temporary.contains(&name),
            });
        }
    }

    skills.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(skills)
}

pub fn import_skill_file(
    root_path: String,
    source_path: String,
) -> Result<SkillFileSummary, ProjectError> {
    let source = PathBuf::from(source_path);
    if source.extension().and_then(|value| value.to_str()) != Some("md") {
        return Err(ProjectError::InvalidInput(
            "Skill 必须是 Markdown 文件。".to_owned(),
        ));
    }

    let source_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("skill.md");
    let safe_name = skill_file_name(source_name);
    let root = PathBuf::from(root_path);
    let relative_path = format!("skills/selected/{safe_name}");
    let target = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(&source)?;
    atomic_write_text(&target, &content)?;
    append_system_event(
        &root,
        "skill_imported",
        serde_json::json!({
            "name": safe_name.clone(),
            "path": relative_path.clone(),
            "sourcePath": source.to_string_lossy().to_string()
        }),
    )?;
    let bytes = target
        .metadata()
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    Ok(SkillFileSummary {
        name: safe_name,
        relative_path,
        bytes,
        disabled: false,
        temporary: false,
    })
}

pub fn set_skill_disabled(
    root_path: String,
    file_name: String,
    disabled: bool,
) -> Result<Vec<SkillFileSummary>, ProjectError> {
    let root = PathBuf::from(&root_path);
    let safe_name = skill_file_name(&file_name);
    update_skill_name_list(&root, ".olienta/disabled-skills.json", &safe_name, disabled)?;
    append_system_event(
        &root,
        "skill_disabled_changed",
        serde_json::json!({
            "name": safe_name,
            "disabled": disabled
        }),
    )?;
    list_selected_skills(root_path)
}

pub fn set_temporary_skill(
    root_path: String,
    file_name: String,
    temporary: bool,
) -> Result<Vec<SkillFileSummary>, ProjectError> {
    let root = PathBuf::from(&root_path);
    let safe_name = skill_file_name(&file_name);
    update_skill_name_list(
        &root,
        ".olienta/temporary-skills.json",
        &safe_name,
        temporary,
    )?;
    append_system_event(
        &root,
        "skill_temporary_changed",
        serde_json::json!({
            "name": safe_name,
            "temporary": temporary
        }),
    )?;
    list_selected_skills(root_path)
}

pub fn analyze_skill_conflicts(root_path: String) -> Result<Vec<String>, ProjectError> {
    let root = PathBuf::from(root_path);
    analyze_skill_conflicts_for_root(&root)
}

pub fn load_skill_file(
    root_path: String,
    file_name: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let safe_name = skill_file_name(&file_name);
    let relative_path = format!("skills/selected/{safe_name}");
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
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

fn default_timeline_settings() -> TimelineSettings {
    TimelineSettings {
        enabled: false,
        conflict_check: false,
        storage: "local-folder".to_owned(),
    }
}

fn reject_software_directory_project_path(root: &Path) -> Result<(), ProjectError> {
    if is_inside_probable_olienta_software_dir(root) || is_inside_dev_olienta_workspace(root) {
        return Err(ProjectError::InvalidInput(
            "小说项目不能放在 Olienta 软件目录内部。请选择软件目录外的作品文件夹，例如 D:\\windsurf\\olienta-projects\\作品名，或任意 Obsidian 可直接打开的小说文件夹。".to_owned(),
        ));
    }

    Ok(())
}

fn is_inside_probable_olienta_software_dir(root: &Path) -> bool {
    let mut current = Some(root);
    while let Some(path) = current {
        if is_probable_olienta_software_dir(path) {
            return true;
        }
        current = path.parent();
    }

    false
}

fn is_probable_olienta_software_dir(root: &Path) -> bool {
    root.join("app")
        .join("src-tauri")
        .join("tauri.conf.json")
        .exists()
        || root.join("app").join("package.json").exists()
        || root.join("src-tauri").join("tauri.conf.json").exists()
        || root.join("package.json").exists() && root.join("src-tauri").exists()
}

fn is_inside_dev_olienta_workspace(root: &Path) -> bool {
    let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") else {
        return false;
    };
    let dev_root = PathBuf::from(manifest_dir)
        .parent()
        .and_then(|path| path.parent())
        .map(Path::to_path_buf);
    let Some(dev_root) = dev_root else {
        return false;
    };
    let Ok(dev_root) = dev_root.canonicalize() else {
        return false;
    };
    let candidate_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let canonical_root = if candidate_root.is_absolute() {
        candidate_root
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(candidate_root))
            .unwrap_or_else(|_| root.to_path_buf())
    };

    canonical_root.starts_with(dev_root)
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
        if !matches!(
            extension.as_str(),
            "md" | "markdown" | "json" | "jsonl" | "txt"
        ) {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);

        files.push(MarkdownFileSummary {
            category: markdown_file_category(&relative_path).to_owned(),
            relative_path,
            bytes,
        });
    }

    Ok(())
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

fn required_project_directories() -> &'static [(&'static str, &'static str)] {
    &[
        ("framework", "故事构架"),
        ("blueprints/chapters", "章节蓝图"),
        ("manuscript/chapters", "正文"),
        ("manuscript/candidates", "候选草稿"),
        ("manuscript/author-input", "作者输入"),
        ("facts", "事实库"),
        ("timeline", "时间轴及里程碑"),
        ("knowledge/markdown/imported", "导入资料"),
        ("characters/cards", "角色卡"),
        ("skills/selected", "已选择 Skill"),
        ("tasks/writing-briefs", "写作任务书"),
        ("logs/model-calls", "模型调用日志"),
        ("exports", "导出目录"),
        (".olienta", "项目配置"),
    ]
}

fn required_project_files() -> &'static [(&'static str, &'static str)] {
    &[
        ("project.yaml", "项目配置总表"),
        ("framework/01-setting.md", "小说设置"),
        ("framework/02-premise.md", "故事前提"),
        ("framework/03-characters.md", "角色图谱"),
        ("framework/04-plot-outline.md", "情节大纲"),
        ("framework/05-world.md", "世界观"),
        ("framework/06-style.md", "文风配置"),
        ("facts/author-confirmation.md", "作者确认"),
        ("facts/confirmed-facts.md", "已确认事实"),
        ("facts/open-loops.md", "未闭合伏笔"),
        ("facts/time-facts.md", "时间事实"),
        ("facts/location-facts.md", "地点事实"),
        ("facts/relation-facts.md", "关系事实"),
        ("facts/event-facts.md", "事件事实"),
        ("facts/world-rules.md", "世界规则"),
        ("facts/forbidden-rules.md", "禁止违背"),
        ("timeline/events.md", "时间轴事件"),
        ("timeline/milestones.md", "里程碑"),
        (".olienta/ai-providers.json", "AI Provider 配置"),
    ]
}

fn recommended_project_files() -> &'static [(&'static str, &'static str)] {
    &[
        ("knowledge/README.md", "知识库说明"),
        ("knowledge/markdown/README.md", "本地 Markdown 说明"),
        ("knowledge/search/README.md", "全文检索说明"),
        ("characters/cards/README.md", "角色卡索引"),
        ("logs/system-events.jsonl", "系统事件日志"),
        ("logs/model-calls/README.md", "模型调用说明"),
        ("logs/model-calls/history.md", "模型调用记录"),
        ("tasks/history.jsonl", "任务历史"),
        ("tasks/current.json", "当前任务状态"),
        ("models/README.md", "模型调用说明"),
    ]
}

fn inspect_project_path(
    root: &Path,
    relative_path: &str,
    label: &str,
    expected_kind: &str,
    required: bool,
) -> ProjectHealthItem {
    let kind = if required {
        format!("required-{expected_kind}")
    } else {
        format!("recommended-{expected_kind}")
    };
    let path = root.join(relative_path);
    let exists = if expected_kind == "directory" {
        path.is_dir()
    } else {
        path.is_file()
    };
    let status = if exists { "ok" } else { "missing" }.to_owned();
    let message = if exists {
        "已就绪。".to_owned()
    } else if required {
        "缺失会影响项目读写，重新打开项目会自动补齐基础结构。".to_owned()
    } else {
        "建议存在，用于更完整的日志、说明或索引体验。".to_owned()
    };

    ProjectHealthItem {
        kind,
        label: label.to_owned(),
        relative_path: relative_path.to_owned(),
        status,
        message,
    }
}

fn is_required_check(kind: &str) -> bool {
    kind.starts_with("required-")
}

fn launch_file_manager(path: &Path) -> Result<(), ProjectError> {
    #[cfg(test)]
    {
        let _ = path;
        Ok(())
    }

    #[cfg(not(test))]
    {
        #[cfg(target_os = "windows")]
        let result = std::process::Command::new("explorer").arg(path).spawn();

        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open").arg(path).spawn();

        #[cfg(all(unix, not(target_os = "macos")))]
        let result = std::process::Command::new("xdg-open").arg(path).spawn();

        result.map(|_| ()).map_err(ProjectError::Io)
    }
}

fn launch_path_in_file_manager(path: &Path) -> Result<(), ProjectError> {
    #[cfg(test)]
    {
        let _ = path;
        Ok(())
    }

    #[cfg(not(test))]
    {
        if path.is_dir() {
            return launch_file_manager(path);
        }

        #[cfg(target_os = "windows")]
        let result = std::process::Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn();

        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn();

        #[cfg(all(unix, not(target_os = "macos")))]
        let result = {
            let parent = path.parent().unwrap_or(path);
            std::process::Command::new("xdg-open").arg(parent).spawn()
        };

        result.map(|_| ()).map_err(ProjectError::Io)
    }
}

fn markdown_file_category(relative_path: &str) -> &'static str {
    if relative_path.starts_with("framework/") {
        "故事构架"
    } else if relative_path.starts_with("blueprints/chapters/") {
        "章节蓝图"
    } else if relative_path.starts_with("manuscript/chapters/") {
        "正文"
    } else if relative_path.starts_with("manuscript/candidates/") {
        "候选稿"
    } else if relative_path.starts_with("manuscript/drafts/") {
        "草稿箱"
    } else if relative_path.starts_with("facts/") {
        "事实库"
    } else if relative_path.starts_with("timeline/") {
        "时间轴"
    } else if relative_path.starts_with("skills/") {
        "Skill"
    } else if relative_path.starts_with("knowledge/") {
        "知识库"
    } else if relative_path.starts_with("exports/") {
        "导出"
    } else if relative_path.starts_with("logs/") {
        "日志"
    } else if relative_path.starts_with("tasks/") {
        "任务"
    } else if relative_path.starts_with(".olienta/") {
        "项目配置"
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
        "framework" => relative_path.starts_with("framework/") || category == "故事构架",
        "manuscript" => {
            relative_path.starts_with("manuscript/")
                || relative_path.starts_with("blueprints/")
                || matches!(category, "正文" | "草稿箱" | "候选稿" | "章节蓝图")
        }
        "memory" => {
            relative_path.starts_with("facts/")
                || relative_path.starts_with("tasks/")
                || relative_path.starts_with("logs/")
                || matches!(category, "事实库" | "任务" | "日志")
        }
        _ => false,
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

fn parse_pinned_context_items(content: &str) -> Vec<PinnedContextItem> {
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

fn parse_pinned_context_heading(line: &str) -> Option<(String, usize)> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix("## ")?;
    let (source, line_number) = rest.rsplit_once(':')?;
    let parsed_line = line_number.trim().parse::<usize>().ok()?;
    let source = source.trim().to_owned();
    (!source.is_empty()).then_some((source, parsed_line.max(1)))
}

fn append_pinned_search_result(
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

#[derive(Clone, Debug)]
struct ExtractedCharacterCard {
    name: String,
    heading: String,
    role_label: Option<String>,
    body: String,
}

fn parse_character_cards_from_framework(content: &str) -> Vec<ExtractedCharacterCard> {
    let lines: Vec<&str> = content.lines().collect();
    let mut sections = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if !trimmed.starts_with("##") || trimmed.starts_with("####") {
            continue;
        }

        let level = trimmed.chars().take_while(|value| *value == '#').count();
        if level < 2 || level > 3 {
            continue;
        }

        let heading = trimmed.trim_start_matches('#').trim().to_owned();
        let Some(name) = character_name_from_heading(&heading) else {
            continue;
        };

        let end = lines
            .iter()
            .enumerate()
            .skip(index + 1)
            .find(|(_, next)| {
                let next_trimmed = next.trim();
                let next_level = next_trimmed
                    .chars()
                    .take_while(|value| *value == '#')
                    .count();
                next_trimmed.starts_with("##") && next_level <= level
            })
            .map(|(next_index, _)| next_index)
            .unwrap_or(lines.len());
        let body = lines[index + 1..end].join("\n").trim().to_owned();
        sections.push(ExtractedCharacterCard {
            name,
            role_label: character_role_from_heading(&heading),
            heading,
            body,
        });
    }

    sections
}

fn character_name_from_heading(heading: &str) -> Option<String> {
    let without_order = heading
        .trim()
        .trim_start_matches(|value: char| {
            value.is_ascii_digit()
                || matches!(
                    value,
                    '一' | '二'
                        | '三'
                        | '四'
                        | '五'
                        | '六'
                        | '七'
                        | '八'
                        | '九'
                        | '十'
                        | '、'
                        | '.'
                        | ' '
                )
        })
        .trim();
    let candidate = without_order
        .split(['—', '-', '：', '(', '（', ':', ' '])
        .next()
        .unwrap_or("")
        .trim()
        .trim_matches('"')
        .trim_matches('“')
        .trim_matches('”');

    if candidate.chars().count() < 2 || candidate.chars().count() > 8 {
        return None;
    }

    let blocked = [
        "主要角色",
        "关系网络",
        "角色成长",
        "图谱总则",
        "角色图谱",
        "人物关系",
        "人物表",
    ];
    (!blocked.iter().any(|item| candidate.contains(item))).then(|| candidate.to_owned())
}

fn character_role_from_heading(heading: &str) -> Option<String> {
    heading
        .split(['—', '-'])
        .nth(1)
        .map(|value| {
            value
                .trim()
                .trim_matches('"')
                .trim_matches('“')
                .trim_matches('”')
                .to_owned()
        })
        .filter(|value| !value.is_empty())
}

fn safe_character_file_stem(name: &str) -> String {
    let stem = name
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric()
                || value == '-'
                || value == '_'
                || ('\u{4e00}'..='\u{9fff}').contains(&value)
            {
                value
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_owned();

    if stem.is_empty() {
        "角色".to_owned()
    } else {
        stem
    }
}

fn render_character_card(card: &ExtractedCharacterCard, source_path: &str) -> String {
    let role = card.role_label.as_deref().unwrap_or("未标注");
    let identity = extract_labeled_value(&card.body, &["身份", "职业", "位置"]);
    let desire = extract_labeled_value(&card.body, &["欲望", "核心欲望", "目标"]);
    let fear = extract_labeled_value(&card.body, &["恐惧", "害怕", "风险"]);
    let boundary = extract_labeled_value(&card.body, &["边界", "底线", "禁忌"]);
    let marker = extract_labeled_value(&card.body, &["物证标志物", "标志物", "道具"]);

    format!(
        "# {name}\n\n来源：{source_path}\n\n## 基础信息\n\n- 原始标题：{heading}\n- 角色标签：{role}\n- 身份：{identity}\n\n## 欲望与风险\n\n- 欲望：{desire}\n- 恐惧：{fear}\n\n## 写作边界\n\n- 边界/禁忌：{boundary}\n- 物证标志物：{marker}\n\n## 原始材料\n\n{body}\n",
        name = card.name,
        heading = card.heading,
        role = role,
        identity = identity.unwrap_or_else(|| "未提取".to_owned()),
        desire = desire.unwrap_or_else(|| "未提取".to_owned()),
        fear = fear.unwrap_or_else(|| "未提取".to_owned()),
        boundary = boundary.unwrap_or_else(|| "未提取".to_owned()),
        marker = marker.unwrap_or_else(|| "未提取".to_owned()),
        body = card.body.trim()
    )
}

fn extract_labeled_value(content: &str, labels: &[&str]) -> Option<String> {
    for line in content.lines() {
        let clean = line
            .trim()
            .trim_start_matches('-')
            .trim()
            .trim_matches('*')
            .trim();
        for label in labels {
            if clean.starts_with(label) {
                let value = clean
                    .trim_start_matches(label)
                    .trim_start_matches(['?', ':'])
                    .trim()
                    .trim_matches('*')
                    .trim();
                if !value.is_empty() {
                    return Some(value.to_owned());
                }
            }
        }
    }
    None
}

fn extract_character_relation_lines(
    body: &str,
    cards: &[ExtractedCharacterCard],
    current_name: &str,
) -> Vec<String> {
    body.lines()
        .filter_map(|line| {
            let clean = line.trim().trim_start_matches('-').trim();
            if clean.is_empty() {
                return None;
            }
            let mentions_other = cards
                .iter()
                .any(|card| card.name != current_name && clean.contains(&card.name));
            (mentions_other || clean.contains("关系") || clean.contains("互动"))
                .then(|| clean.to_owned())
        })
        .take(12)
        .collect()
}

fn extract_character_growth_lines(body: &str) -> Vec<String> {
    let keywords = [
        "成长",
        "变化",
        "转变",
        "代价",
        "选择",
        "动机",
        "关键节点",
        "弧光",
        "目标",
    ];
    body.lines()
        .filter_map(|line| {
            let clean = line.trim().trim_start_matches('-').trim();
            (!clean.is_empty() && keywords.iter().any(|keyword| clean.contains(keyword)))
                .then(|| clean.to_owned())
        })
        .take(12)
        .collect()
}

fn is_previewable_project_text(relative_path: &str) -> bool {
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
        "导入资料文件重名过多，请先整理 imported 文件夹。".to_owned(),
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
        if should_skip_vault_path(file_name) {
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

fn skill_file_name(file_name: &str) -> String {
    let name = file_name
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.'))
        .collect::<String>();
    let fallback = if name.is_empty() {
        "skill.md".to_owned()
    } else {
        name
    };

    if fallback.ends_with(".md") {
        fallback
    } else {
        format!("{fallback}.md")
    }
}

fn read_skill_name_list(root: &Path, relative_path: &str) -> Result<Vec<String>, ProjectError> {
    let path = ensure_project_path(root, relative_path)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path)?;
    let names: Vec<String> = serde_json::from_str(&content).unwrap_or_default();
    Ok(names
        .into_iter()
        .map(|name| skill_file_name(&name))
        .filter(|name| !name.trim().is_empty())
        .collect())
}

fn update_skill_name_list(
    root: &Path,
    relative_path: &str,
    file_name: &str,
    enabled: bool,
) -> Result<(), ProjectError> {
    let mut names = read_skill_name_list(root, relative_path)?;
    let safe_name = skill_file_name(file_name);

    if enabled {
        if !names.contains(&safe_name) {
            names.push(safe_name);
        }
    } else {
        names.retain(|name| name != &safe_name);
    }

    names.sort();
    names.dedup();
    let target = ensure_project_path(root, relative_path)?;
    atomic_write_text(&target, &(serde_json::to_string_pretty(&names)? + "\n"))?;
    Ok(())
}

fn analyze_skill_conflicts_for_root(root: &Path) -> Result<Vec<String>, ProjectError> {
    let disabled = read_skill_name_list(root, ".olienta/disabled-skills.json")?;
    let skills_dir = ensure_project_path(root, "skills/selected")?;
    let mut active_chunks = Vec::new();

    if skills_dir.exists() {
        for entry in fs::read_dir(skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .map(skill_file_name)
                .unwrap_or_else(|| "skill.md".to_owned());
            if disabled.contains(&name) {
                continue;
            }

            active_chunks.push(fs::read_to_string(path)?);
        }
    }

    let content = active_chunks.join("\n").to_ascii_lowercase();
    let mut warnings = Vec::new();
    if (content.contains("第一人称") || content.contains("first person"))
        && (content.contains("第三人称") || content.contains("third person"))
    {
        warnings.push("存在第一人称和第三人称同时启用的写法规则，请确认叙事视角。".to_owned());
    }
    if (content.contains("快节奏") || content.contains("爽点") || content.contains("强推进"))
        && (content.contains("慢节奏") || content.contains("留白") || content.contains("文学性"))
    {
        warnings.push("存在快节奏/爽点与慢节奏/留白并存的 Skill，请确认本章节奏。".to_owned());
    }
    if (content.contains("严格遵循") || content.contains("不得改动"))
        && (content.contains("自由发挥") || content.contains("改写") || content.contains("即兴"))
    {
        warnings.push("存在严格遵循与自由发挥并存的 Skill，请确认 AI 的改写边界。".to_owned());
    }

    if warnings.is_empty() && !active_chunks.is_empty() {
        warnings.push("已加载 Skill，未发现明显冲突。".to_owned());
    }

    Ok(warnings)
}

fn read_selected_skills(root: &Path) -> Result<String, ProjectError> {
    let skills_dir = ensure_project_path(root, "skills/selected")?;
    let disabled = read_skill_name_list(root, ".olienta/disabled-skills.json")?;
    let temporary = read_skill_name_list(root, ".olienta/temporary-skills.json")?;
    let mut chunks = Vec::new();

    if skills_dir.exists() {
        for entry in fs::read_dir(skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md");
            let safe_name = skill_file_name(name);
            if disabled.contains(&safe_name) && !temporary.contains(&safe_name) {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let scope = if temporary.contains(&safe_name) {
                "临时启用"
            } else {
                "已选择"
            };
            chunks.push(format!("## {name}（{scope}）\n\n{content}"));
        }
    }

    chunks.sort();

    if chunks.is_empty() {
        Ok("没有启用的 Skill。".to_owned())
    } else {
        Ok(chunks.join("\n\n---\n\n"))
    }
}

fn read_character_context(root: &Path) -> Result<String, ProjectError> {
    let mut chunks = Vec::new();

    for relative_path in [
        "characters/cards/INDEX.md",
        "characters/relations.md",
        "characters/growth.md",
    ] {
        let content = read_optional_project_file(root, relative_path)?;
        if !content.trim().is_empty() {
            chunks.push(format!("## {relative_path}\n\n{content}"));
        }
    }

    let cards_dir = ensure_project_path(root, "characters/cards")?;
    let mut card_chunks = Vec::new();
    if cards_dir.exists() {
        for entry in fs::read_dir(cards_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            if name.eq_ignore_ascii_case("README.md") || name.eq_ignore_ascii_case("INDEX.md") {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            if content.trim().is_empty() {
                continue;
            }
            card_chunks.push(format!(
                "### {}\n\n{}",
                path.strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/"),
                content
            ));
        }
    }

    card_chunks.sort();
    if !card_chunks.is_empty() {
        chunks.push(format!(
            "## 独立角色卡\n\n{}",
            card_chunks.join("\n\n---\n\n")
        ));
    }

    if chunks.is_empty() {
        Ok("还没有可用的角色上下文。".to_owned())
    } else {
        Ok(chunks.join("\n\n---\n\n"))
    }
}

fn timeline_constraints_enabled(root: &Path) -> Result<bool, ProjectError> {
    let settings = load_timeline_settings(root.to_string_lossy().to_string())?;
    Ok(settings.enabled && settings.conflict_check)
}

fn read_timeline_context(root: &Path) -> Result<String, ProjectError> {
    let events = read_optional_project_file(root, "timeline/events.md")?;
    let milestones = read_optional_project_file(root, "timeline/milestones.md")?;

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

fn read_active_timeline_context(root: &Path) -> Result<Option<String>, ProjectError> {
    if timeline_constraints_enabled(root)? {
        Ok(Some(read_timeline_context(root)?))
    } else {
        Ok(None)
    }
}

fn rescan_facts_for_root(root: &Path) -> Result<(), ProjectError> {
    let facts_path = ensure_project_path(root, "facts/confirmed-facts.md")?;
    backup_confirmed_facts(root, &facts_path)?;

    let chapters_dir = ensure_project_path(root, "manuscript/chapters")?;
    let mut facts = Vec::new();

    if chapters_dir.exists() {
        for entry in fs::read_dir(chapters_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let content = fs::read_to_string(&path)?;
            if is_placeholder_or_empty(&content) {
                continue;
            }

            let chapter_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            let title = extract_title(&content).unwrap_or_else(|| "未命名章节".to_owned());
            facts.extend(extract_chapter_facts(chapter_id, &title, &content));
        }
    }

    facts.sort();
    facts.dedup();

    let mut output = "# 已确认事实\n\n".to_owned();
    if facts.is_empty() {
        output.push_str("暂无可重扫事实。\n");
    } else {
        output.push_str("以下事实来自已保存正文，后续 AI 生成必须尊重。\n\n");
        output.push_str(&facts.join("\n"));
        output.push('\n');
    }

    atomic_write_text(&facts_path, &output)?;
    write_classified_fact_files(root, &facts)?;
    Ok(())
}

fn backup_confirmed_facts(root: &Path, facts_path: &Path) -> Result<(), ProjectError> {
    if !facts_path.exists() {
        return Ok(());
    }

    let existing = fs::read_to_string(facts_path).unwrap_or_default();
    if existing.trim().is_empty() {
        return Ok(());
    }

    let history_dir = ensure_project_path(root, "facts/history")?;
    fs::create_dir_all(&history_dir)?;
    let version = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let backup_path = history_dir.join(format!("confirmed-facts-{version}.md"));
    atomic_write_text(&backup_path, &existing)?;
    Ok(())
}

fn extract_chapter_facts(chapter_id: &str, title: &str, content: &str) -> Vec<String> {
    let mut facts = vec![format!(
        "- {chapter_id}《{title}》已保存为作者确认正文，后续 AI 生成必须尊重。{}",
        fact_source_marker(chapter_id, title, content, title)
    )];

    for name in ["杨志远", "王静", "欧阳", "苏青", "国叶儿"] {
        if content.contains(name) {
            facts.push(format!(
                "- {chapter_id} 出现角色：{name}。{}",
                fact_source_marker(chapter_id, title, content, name)
            ));
        }
    }

    for year in 2017..=2024 {
        let year_text = year.to_string();
        if content.contains(&year_text) {
            facts.push(format!(
                "- {chapter_id} 提到年份：{year_text}。{}",
                fact_source_marker(chapter_id, title, content, &year_text)
            ));
        }
    }

    for keyword in [
        "广州", "上海", "深圳", "手术", "股权", "诊所", "现金", "病历", "CBD",
    ] {
        if content.contains(keyword) {
            facts.push(format!(
                "- {chapter_id} 提到关键词：{keyword}。{}",
                fact_source_marker(chapter_id, title, content, keyword)
            ));
        }
    }

    facts
}

fn fact_source_marker(chapter_id: &str, title: &str, content: &str, needle: &str) -> String {
    let paragraphs = source_paragraphs(content);
    let matched = paragraphs
        .iter()
        .position(|paragraph| !needle.is_empty() && paragraph.contains(needle))
        .or_else(|| {
            paragraphs
                .iter()
                .position(|paragraph| !paragraph.starts_with('#'))
        })
        .unwrap_or(0);
    let snippet = paragraphs
        .get(matched)
        .map(|paragraph| trim_source_snippet(paragraph))
        .unwrap_or_default();

    format!(
        " 来源：第 {chapter_id} 章《{title}》，段落 {}：{snippet}",
        matched + 1
    )
}

fn source_paragraphs(content: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    let mut current = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                paragraphs.push(current.join(" "));
                current.clear();
            }
        } else {
            current.push(line.trim().to_owned());
        }
    }

    if !current.is_empty() {
        paragraphs.push(current.join(" "));
    }

    paragraphs
}

fn trim_source_snippet(paragraph: &str) -> String {
    let compact = paragraph.replace('\t', " ").trim().to_owned();
    if compact.chars().count() <= 80 {
        compact
    } else {
        format!("{}...", compact.chars().take(80).collect::<String>())
    }
}

fn write_classified_fact_files(root: &Path, facts: &[String]) -> Result<(), ProjectError> {
    for (relative_path, title) in CLASSIFIED_FACT_FILES {
        let matched: Vec<&String> = facts
            .iter()
            .filter(|fact| classified_fact_path(fact) == *relative_path)
            .collect();
        let mut content = format!("# {title}\n\n");
        if matched.is_empty() {
            content.push_str("暂无自动抽取内容。作者可以手动补充。\n");
        } else {
            for fact in matched {
                content.push_str(fact);
                content.push('\n');
            }
        }
        let target = ensure_project_path(root, relative_path)?;
        atomic_write_text(&target, &content)?;
    }
    Ok(())
}

fn classified_fact_path(fact: &str) -> &'static str {
    let fact_body = fact.split(" 来源：").next().unwrap_or(fact);
    if fact_body.contains("角色") || fact_body.contains("人物") || fact_body.contains("出场")
    {
        "facts/character-facts.md"
    } else if fact_body.contains("时间") || fact_body.contains("年") || fact_body.contains("章")
    {
        "facts/time-facts.md"
    } else if fact_body.contains("地点")
        || fact_body.contains("CBD")
        || fact_body.contains("深圳")
        || fact_body.contains("诊所")
    {
        "facts/location-facts.md"
    } else if fact_body.contains("关系") || fact_body.contains("冲突") || fact_body.contains("爱")
    {
        "facts/relation-facts.md"
    } else if fact_body.contains("规则")
        || fact_body.contains("世界观")
        || fact_body.contains("禁止")
    {
        "facts/world-rules.md"
    } else {
        "facts/event-facts.md"
    }
}

fn read_classified_fact_files(root: &Path) -> Result<String, ProjectError> {
    let mut content = String::new();
    for (relative_path, title) in CLASSIFIED_FACT_FILES {
        let file = read_optional_project_file(root, relative_path)?;
        if !file.trim().is_empty() {
            content.push_str(&format!("## {title}\n\n{file}\n\n"));
        }
    }
    Ok(content)
}

fn append_model_call_log(root: &Path, log: ModelCallLog<'_>) -> Result<(), ProjectError> {
    fs::create_dir_all(ensure_project_path(root, "logs/model-calls")?)?;
    let target = ensure_project_path(root, "logs/model-calls/history.md")?;
    let mut content =
        fs::read_to_string(&target).unwrap_or_else(|_| "# Model Call History\n\n".to_owned());
    content.push_str(&format!(
        "\n## {}\n\n- status: {}\n- provider: {}\n- chapter: {}\n- input: {}\n- output: {}\n- message: {}\n",
        log.task,
        if log.ok { "ok" } else { "failed" },
        log.provider,
        log.chapter_id.unwrap_or("-"),
        log.input_path.unwrap_or("-"),
        log.output_path.unwrap_or("-"),
        log.message
    ));
    atomic_write_text(&target, &content)?;
    Ok(())
}

fn select_provider_for_use_case(
    root: &Path,
    use_cases: &[&str],
) -> Result<Option<AiProviderConfig>, ProjectError> {
    let raw = read_optional_project_file(root, ".olienta/ai-providers.json")?;
    if raw.trim().is_empty() {
        return Ok(None);
    }
    let providers: Vec<AiProviderConfig> = serde_json::from_str(&raw)?;
    Ok(providers.into_iter().find(|provider| {
        provider.enabled.unwrap_or(false)
            && provider
                .use_cases
                .as_ref()
                .map(|items| {
                    items.iter().any(|item| {
                        use_cases
                            .iter()
                            .any(|requested| item.eq_ignore_ascii_case(requested))
                    })
                })
                .unwrap_or(true)
    }))
}

fn select_chapter_provider(root: &Path) -> Result<Option<AiProviderConfig>, ProjectError> {
    select_provider_for_use_case(root, &["chapter"])
}

fn provider_label(provider: &AiProviderConfig) -> String {
    let name = provider
        .name
        .as_deref()
        .or(provider.id.as_deref())
        .unwrap_or("provider")
        .to_owned();
    match provider
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        Some(model) => format!("{name} ({model})"),
        None => name,
    }
}

fn call_openai_compatible(provider: &AiProviderConfig, prompt: &str) -> Result<String, String> {
    call_openai_compatible_with_system(provider, "", prompt)
}

fn call_openai_compatible_with_system(
    provider: &AiProviderConfig,
    system: &str,
    prompt: &str,
) -> Result<String, String> {
    if provider.api_key.as_deref().unwrap_or("").trim().is_empty() {
        return Err("provider api key is empty".to_owned());
    }

    let kind = provider.kind.as_deref().unwrap_or("OpenAI-compatible");
    let base_url = provider
        .base_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("https://api.openai.com/v1");
    let model = provider
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("unspecified-model");
    let temperature = provider.temperature.unwrap_or(0.7);

    Ok(format!(
        "Local placeholder response via {kind} {base_url} {model} temp={temperature:.2}; system={}; prompt={}",
        trim_for_status(system),
        prompt.trim()
    ))
}

fn generate_candidate_content(
    _root: &Path,
    chapter_id: &str,
    brief: &WritingBrief,
) -> CandidateGenerationResult {
    CandidateGenerationResult {
        content: format!(
            "# 第 {chapter_id} 章候选稿\n\n根据写作任务书 `{}` 生成。\n\n{}",
            brief.relative_path,
            brief.content.lines().take(8).collect::<Vec<_>>().join("\n")
        ),
        source: "local-placeholder".to_owned(),
        fallback_reason: Some("没有启用的 Provider，已生成本地占位候选稿。".to_owned()),
    }
}

fn write_candidate_review_report(
    root: &Path,
    chapter_id: &str,
    candidate_path: &str,
    brief_path: &str,
    warnings: &[String],
) -> Result<String, ProjectError> {
    let relative_path = format!("manuscript/candidates/reviews/{chapter_id}.md");
    let mut content = format!(
        "# 第 {chapter_id} 章候选稿审查\n\n- 候选稿：`{candidate_path}`\n- 任务书：`{brief_path}`\n\n"
    );
    content.push_str("## 审查清单\n\n");
    if warnings.is_empty() {
        content.push_str("- 暂无审查提醒。\n");
    } else {
        for (title, items) in grouped_candidate_warnings(warnings) {
            content.push_str(&format!("### {title}\n\n"));
            for warning in items {
                content.push_str(&format!("- {warning}\n"));
            }
            content.push('\n');
        }
    }
    atomic_write_text(&ensure_project_path(root, &relative_path)?, &content)?;
    Ok(relative_path)
}

fn grouped_candidate_warnings(warnings: &[String]) -> Vec<(&'static str, Vec<&String>)> {
    let groups = [
        ("时间线与里程碑", "时间线|里程碑|提前触发"),
        ("章节蓝图", "蓝图|本章必须|禁区"),
        ("事实库与禁写规则", "事实|禁写"),
        ("角色边界", "角色"),
        ("钉选材料", "钉选材料"),
        ("伏笔与回收", "伏笔"),
        ("生成与任务书", "生成来源|写作任务书|AI 调用降级"),
        ("文本质量", ""),
    ];
    let mut output = groups
        .iter()
        .map(|(title, _)| (*title, Vec::new()))
        .collect::<Vec<_>>();

    for warning in warnings {
        let index = groups
            .iter()
            .position(|(_, pattern)| {
                pattern.is_empty()
                    || pattern
                        .split('|')
                        .any(|keyword| !keyword.is_empty() && warning.contains(keyword))
            })
            .unwrap_or(groups.len() - 1);
        output[index].1.push(warning);
    }

    output
        .into_iter()
        .filter(|(_, items)| !items.is_empty())
        .collect()
}

fn collect_labeled_lines(content: &str, labels: &[&str]) -> Vec<String> {
    content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            labels.iter().any(|label| trimmed.contains(label))
                || trimmed.starts_with("- ")
                || trimmed.starts_with("* ")
        })
        .map(|line| line.trim().trim_start_matches(['-', '*', ' ']).to_owned())
        .filter(|line| !line.is_empty())
        .collect()
}

fn extract_keywords_from_lines(lines: &[String]) -> Vec<String> {
    lines
        .iter()
        .flat_map(|line| line.split(['，', ',', '、', ' ', '：', ':']))
        .map(|item| item.trim().to_owned())
        .filter(|item| item.chars().count() >= 2 && item.chars().count() <= 16)
        .collect()
}

fn knowledge_relative_path(kind: &str) -> &'static str {
    match kind {
        "open-loops" => "facts/open-loops.md",
        "forbidden-rules" => "facts/forbidden-rules.md",
        "author-confirmation" => "facts/author-confirmation.md",
        _ => "facts/confirmed-facts.md",
    }
}

fn load_chapter_side_file(
    root_path: String,
    chapter_id: String,
    folder: &str,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("{folder}/{id}.md");
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();

    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

fn review_candidate_content(content: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    let cliche_words = ["突然", "然后", "其实", "命运", "无法言说"];

    for word in cliche_words {
        if content.matches(word).count() >= 2 {
            warnings.push(format!(
                "候选稿多次使用“{word}”，建议检查是否有模板化或重复表达。"
            ));
        }
    }

    if content.contains("作为一个AI") || content.contains("作为 AI") {
        warnings.push("候选稿出现 AI 自我说明，请删除元叙事痕迹。".to_owned());
    }

    if count_words(content) < 500 {
        warnings.push("候选稿明显偏短，可能不是完整章节。".to_owned());
    }

    if !content.contains('？') && !content.contains('?') && !content.contains("为什么") {
        warnings.push("候选稿缺少显性问题或张力句，建议检查章节推进力。".to_owned());
    }

    warnings
}

fn review_candidate_with_context(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<Vec<String>, ProjectError> {
    let mut warnings = review_candidate_content(content);
    let blueprint =
        read_optional_project_file(root, &format!("blueprints/chapters/{chapter_id}.md"))?;
    let confirmed_facts = read_optional_project_file(root, "facts/confirmed-facts.md")?;
    let forbidden_rules = read_optional_project_file(root, "facts/forbidden-rules.md")?;
    let open_loops = read_optional_project_file(root, "facts/open-loops.md")?;
    let character_context = read_character_context(root)?;
    let timeline_context = read_active_timeline_context(root)?;
    let pinned_context =
        read_optional_project_file(root, &format!("tasks/pinned-context/{chapter_id}.md"))?;

    warnings.extend(review_candidate_against_blueprint(content, &blueprint));
    warnings.extend(review_candidate_against_constraints(
        content,
        &confirmed_facts,
        &forbidden_rules,
        &open_loops,
    ));
    warnings.extend(review_candidate_against_character_context(
        content,
        &character_context,
    ));
    warnings.extend(review_candidate_against_pinned_context(
        content,
        &pinned_context,
    ));
    if let Some(timeline_context) = timeline_context {
        warnings.extend(review_candidate_against_timeline(
            content,
            &timeline_context,
            chapter_id,
        ));
    }
    warnings.sort();
    warnings.dedup();
    Ok(warnings)
}

fn review_candidate_against_blueprint(content: &str, blueprint: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    if blueprint.trim().is_empty() {
        warnings.push("当前章节蓝图为空，候选稿缺少结构约束。".to_owned());
        return warnings;
    }

    let forbidden = collect_labeled_lines(
        blueprint,
        &["禁止提前发生", "不得提前", "不能发生", "禁止", "边界"],
    );
    for keyword in extract_keywords_from_lines(&forbidden) {
        if !keyword.is_empty() && content.contains(&keyword) {
            warnings.push(format!(
                "候选稿可能触碰蓝图禁区：“{keyword}”，请确认是否提前泄露。"
            ));
        }
    }

    let must_happen =
        collect_labeled_lines(blueprint, &["必须发生", "本章目标", "关键动作", "必须写到"]);
    for keyword in extract_keywords_from_lines(&must_happen)
        .into_iter()
        .take(6)
    {
        if keyword.chars().count() >= 2 && !content.contains(&keyword) {
            warnings.push(format!("候选稿可能遗漏本章必须发生内容：“{keyword}”。"));
        }
    }

    warnings
}

fn review_candidate_against_constraints(
    content: &str,
    confirmed_facts: &str,
    forbidden_rules: &str,
    open_loops: &str,
) -> Vec<String> {
    let mut warnings = Vec::new();
    let constraint_text = format!("{confirmed_facts}\n{forbidden_rules}");
    for line in constraint_lines(&constraint_text).into_iter().take(12) {
        let keywords = constraint_keywords(&line);
        if keywords.is_empty() {
            continue;
        }
        let hits = keywords
            .iter()
            .filter(|keyword| content.contains(keyword.as_str()))
            .count();
        if hits > 0 && (line.contains("禁止") || line.contains("不得") || line.contains("不能"))
        {
            warnings.push(format!(
                "候选稿可能违反事实或禁写规则：{}",
                trim_for_status(&line)
            ));
        }
        if hits > 0 && contains_negation(content) && line.contains("必须") {
            warnings.push(format!(
                "候选稿可能否定了必须保持的事实：{}",
                trim_for_status(&line)
            ));
        }
    }

    if !open_loops.trim().is_empty() && contains_resolution(content) {
        warnings.push("候选稿可能提前解开未闭合伏笔，请确认是否符合章节节奏。".to_owned());
    }

    warnings
}

fn review_candidate_against_character_context(
    content: &str,
    character_context: &str,
) -> Vec<String> {
    let mut warnings = Vec::new();
    if character_context.trim().is_empty() || character_context.contains("还没有可用的角色上下文")
    {
        return warnings;
    }

    let mentioned_cards = character_names_from_context(character_context)
        .into_iter()
        .filter(|name| content.contains(name))
        .collect::<Vec<_>>();
    if mentioned_cards.is_empty() {
        return warnings;
    }

    for name in mentioned_cards {
        let section = character_section_from_context(character_context, &name);
        for line in constraint_lines(&section).into_iter().take(12) {
            let is_boundary = line.contains("边界")
                || line.contains("禁忌")
                || line.contains("恐惧")
                || line.contains("欲望")
                || line.contains("不能")
                || line.contains("不得")
                || line.contains("必须")
                || line.contains("底线")
                || line.contains("关系")
                || line.contains("动机")
                || line.contains("策略")
                || line.contains("身份")
                || line.contains("目标");

            if !is_boundary {
                continue;
            }

            let keywords = constraint_keywords(&line);
            let hits = keywords
                .iter()
                .filter(|keyword| content.contains(keyword.as_str()))
                .count();
            if hits == 0 {
                warnings.push(format!(
                    "候选稿提到角色“{name}”，但可能未体现角色约束：{}",
                    trim_for_status(&line)
                ));
            } else if contains_negation(content) {
                warnings.push(format!(
                    "候选稿可能否定角色“{name}”的既定设定：{}",
                    trim_for_status(&line)
                ));
            }
        }
    }

    warnings
}

fn review_candidate_against_pinned_context(content: &str, pinned_context: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    for item in parse_pinned_context_items(pinned_context)
        .into_iter()
        .take(20)
    {
        let keywords = constraint_keywords(&item.snippet);
        if keywords.is_empty() {
            continue;
        }

        let hits = keywords
            .iter()
            .filter(|keyword| content.contains(keyword.as_str()))
            .count();
        if hits == 0 {
            warnings.push(format!(
                "候选稿可能遗漏钉选材料：{}，来源 {}:{}",
                trim_for_status(&item.snippet),
                item.source_path,
                item.line_number
            ));
        } else if contains_negation(content) {
            warnings.push(format!(
                "候选稿可能否定钉选材料：{}",
                trim_for_status(&item.snippet)
            ));
        }
    }

    warnings
}

fn review_candidate_against_timeline(
    content: &str,
    timeline_context: &str,
    chapter_id: &str,
) -> Vec<String> {
    let mut warnings = Vec::new();
    let current_chapter = chapter_id.parse::<u32>().unwrap_or(0);

    for line in constraint_lines(timeline_context).into_iter().take(24) {
        let line_chapter = first_chapter_number(&line);
        let is_future_milestone = line_chapter
            .map(|chapter| current_chapter > 0 && chapter > current_chapter)
            .unwrap_or(false);
        let is_timeline_boundary = is_future_milestone
            || line.contains("不得提前")
            || line.contains("禁止提前")
            || line.contains("未来")
            || line.contains("后续")
            || line.contains("第")
            || line.contains("章")
            || line.contains("里程碑")
            || line.contains("时间线");

        if !is_timeline_boundary {
            continue;
        }

        let keywords = constraint_keywords(&line);
        let hits = keywords
            .iter()
            .filter(|keyword| content.contains(keyword.as_str()))
            .count();
        let resolution_hit = contains_resolution(content);

        if hits > 0 || (is_future_milestone && resolution_hit) {
            warnings.push(format!(
                "候选稿可能提前触发时间线或里程碑：{}",
                trim_for_status(&line)
            ));
        }
    }

    warnings
}

fn first_chapter_number(line: &str) -> Option<u32> {
    let mut digits = String::new();
    for ch in line.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
            continue;
        }
        if !digits.is_empty() && (ch == '?' || ch == ' ' || ch == '?' || ch == ':') {
            if let Ok(value) = digits.parse::<u32>() {
                return Some(value);
            }
        }
        if !ch.is_ascii_digit() && !digits.is_empty() {
            digits.clear();
        }
    }
    digits.parse::<u32>().ok()
}

fn character_section_from_context(character_context: &str, name: &str) -> String {
    let mut matched = false;
    let mut output = Vec::new();
    for line in character_context.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            let heading = trimmed.trim_start_matches('#').trim();
            matched = heading == name;
            continue;
        }
        if matched {
            output.push(line);
        }
    }
    output.join("\n")
}

fn character_names_from_context(character_context: &str) -> Vec<String> {
    let mut names = Vec::new();
    for line in character_context.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("# ") {
            continue;
        }
        let name = trimmed.trim_start_matches('#').trim();
        if character_name_from_heading(name).is_some() {
            names.push(name.to_owned());
        }
    }
    names.sort();
    names.dedup();
    names
}

fn constraint_lines(content: &str) -> Vec<String> {
    content
        .lines()
        .map(|line| {
            line.trim()
                .trim_start_matches('-')
                .trim_start_matches('*')
                .trim()
                .to_owned()
        })
        .filter(|line| {
            line.len() >= 6
                && !line.starts_with('#')
                && !line.contains("未提取")
                && !line.contains("暂无")
        })
        .collect()
}

fn constraint_keywords(content: &str) -> Vec<String> {
    let stop_words = [
        "以及",
        "一个",
        "这个",
        "那个",
        "没有",
        "不是",
        "可以",
        "需要",
        "必须",
        "不得",
        "不能",
        "进行",
        "出现",
        "角色",
        "章节",
        "正文",
        "候选稿",
        "蓝图",
        "材料",
        "内容",
        "作者",
        "已经",
    ];
    let mut keywords = Vec::new();
    let mut current = String::new();
    for ch in content.chars() {
        if ch.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            current.push(ch);
        } else {
            push_keyword(&mut keywords, &mut current, &stop_words);
        }
    }
    push_keyword(&mut keywords, &mut current, &stop_words);
    for term in [
        "身份", "欲望", "恐惧", "边界", "禁忌", "底线", "目标", "动机", "关系",
    ] {
        if content.contains(term) {
            keywords.push(term.to_owned());
        }
    }
    keywords.sort();
    keywords.dedup();
    keywords
}

fn push_keyword(keywords: &mut Vec<String>, current: &mut String, stop_words: &[&str]) {
    let value = current.trim();
    if value.chars().count() >= 2 && !stop_words.iter().any(|word| word == &value) {
        keywords.push(value.to_owned());
    }
    current.clear();
}

fn contains_negation(content: &str) -> bool {
    ["没有", "并非", "不是", "不再", "取消", "不存在"]
        .iter()
        .any(|word| content.contains(word))
}

fn contains_resolution(content: &str) -> bool {
    [
        "真相大白",
        "谜底揭开",
        "彻底解决",
        "全部说清",
        "伏笔收束",
        "问题解决",
    ]
    .iter()
    .any(|word| content.contains(word))
}

fn trim_for_status(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() > 120 {
        format!("{}...", trimmed.chars().take(120).collect::<String>())
    } else {
        trimmed.to_owned()
    }
}

fn markdown_to_plain_text(markdown: &str) -> String {
    markdown
        .lines()
        .map(|line| {
            line.trim_start()
                .trim_start_matches('#')
                .trim_start_matches('>')
                .trim_start_matches("- ")
                .trim()
                .to_owned()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn markdown_to_docx(markdown: &str) -> Result<Vec<u8>, ProjectError> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("[Content_Types].xml", options)?;
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>"#,
        )?;

        zip.add_directory("_rels/", options)?;
        zip.start_file("_rels/.rels", options)?;
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
        )?;

        zip.add_directory("word/", options)?;
        zip.add_directory("word/_rels/", options)?;
        zip.start_file("word/_rels/document.xml.rels", options)?;
        zip.write_all(docx_document_rels_xml().as_bytes())?;

        zip.start_file("word/styles.xml", options)?;
        zip.write_all(docx_styles_xml().as_bytes())?;

        zip.start_file("word/header1.xml", options)?;
        zip.write_all(docx_header_xml().as_bytes())?;

        zip.start_file("word/footer1.xml", options)?;
        zip.write_all(docx_footer_xml().as_bytes())?;

        zip.start_file("word/document.xml", options)?;
        zip.write_all(docx_document_xml(markdown).as_bytes())?;
        zip.finish()?;
    }

    Ok(cursor.into_inner())
}

fn docx_document_xml(markdown: &str) -> String {
    let mut paragraphs = String::new();
    let mut list_index = 0;
    let mut heading_one_count = 0;
    let metadata = docx_metadata(markdown);

    paragraphs.push_str(&docx_cover_xml(&metadata));
    paragraphs.push_str(&docx_toc_xml(&metadata));

    for raw_line in markdown.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with("```") {
            continue;
        }

        let (style, text, first_line, bullet, page_break_before) =
            if let Some(text) = line.strip_prefix("# ") {
                heading_one_count += 1;
                ("Heading1", text.trim(), false, false, heading_one_count > 1)
            } else if let Some(text) = line.strip_prefix("## ") {
                ("Heading2", text.trim(), false, false, false)
            } else if let Some(text) = line.strip_prefix("### ") {
                ("Heading3", text.trim(), false, false, false)
            } else if let Some(text) = line.strip_prefix(">") {
                ("Quote", text.trim(), false, false, false)
            } else if let Some(text) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
                list_index += 1;
                ("Normal", text.trim(), false, true, false)
            } else {
                ("Normal", line, true, false, false)
            };

        paragraphs.push_str(&docx_paragraph(
            style,
            text,
            first_line,
            bullet,
            list_index,
            page_break_before,
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {paragraphs}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader1"/>
      <w:footerReference w:type="default" r:id="rIdFooter1"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"#
    )
}

struct DocxMetadata {
    title: String,
    chapters: Vec<String>,
    word_count: usize,
}

fn docx_metadata(markdown: &str) -> DocxMetadata {
    let chapters = markdown
        .lines()
        .filter_map(|line| line.trim().strip_prefix("# "))
        .map(|title| strip_markdown_inline(title.trim()))
        .filter(|title| !title.is_empty())
        .collect::<Vec<_>>();
    let title = chapters
        .first()
        .cloned()
        .unwrap_or_else(|| "Olienta 作品导出".to_owned());
    DocxMetadata {
        title,
        chapters,
        word_count: count_words(&markdown_to_plain_text(markdown)),
    }
}

fn docx_cover_xml(metadata: &DocxMetadata) -> String {
    [
        docx_centered_paragraph("Title", &metadata.title),
        docx_centered_paragraph("Subtitle", "Olienta 作品导出"),
        docx_centered_paragraph(
            "ExportMeta",
            &format!(
                "章节数：{} · 字数：{}",
                metadata.chapters.len(),
                metadata.word_count
            ),
        ),
        docx_page_break_paragraph(),
    ]
    .join("")
}

fn docx_toc_xml(metadata: &DocxMetadata) -> String {
    let mut content = String::new();
    content.push_str(&docx_centered_paragraph("Heading1", "目录"));
    if metadata.chapters.is_empty() {
        content.push_str(&docx_paragraph(
            "Normal",
            "暂无章节。",
            false,
            false,
            0,
            false,
        ));
    } else {
        for (index, chapter) in metadata.chapters.iter().enumerate() {
            content.push_str(&docx_paragraph(
                "TocEntry",
                &format!("{}. {}", index + 1, chapter),
                false,
                false,
                0,
                false,
            ));
        }
    }
    content.push_str(&docx_page_break_paragraph());
    content
}

fn docx_centered_paragraph(style: &str, text: &str) -> String {
    let escaped = xml_escape(text);
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{style}"/><w:jc w:val="center"/></w:pPr><w:r><w:t>{escaped}</w:t></w:r></w:p>"#
    )
}

fn docx_page_break_paragraph() -> String {
    r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#.to_owned()
}

fn docx_paragraph(
    style: &str,
    text: &str,
    first_line: bool,
    bullet: bool,
    index: usize,
    page_break_before: bool,
) -> String {
    let escaped = xml_escape(&strip_markdown_inline(text));
    let style_xml = if style == "Normal" {
        String::new()
    } else {
        format!(r#"<w:pStyle w:val="{style}"/>"#)
    };
    let indent_xml = if first_line {
        r#"<w:ind w:firstLine="420"/>"#.to_owned()
    } else if bullet {
        r#"<w:ind w:left="720" w:hanging="360"/>"#.to_owned()
    } else {
        String::new()
    };
    let page_break_xml = if page_break_before {
        r#"<w:pageBreakBefore/>"#
    } else {
        ""
    };
    let bullet_text = if bullet {
        format!("{}. {escaped}", index)
    } else {
        escaped
    };

    format!(
        r#"<w:p><w:pPr>{style_xml}{page_break_xml}{indent_xml}</w:pPr><w:r><w:t>{bullet_text}</w:t></w:r></w:p>"#
    )
}

fn docx_document_rels_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>"#
        .to_owned()
}

fn docx_header_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r><w:t>Olienta 作品导出</w:t></w:r>
  </w:p>
</w:hdr>"#
        .to_owned()
}

fn docx_footer_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:t>第 </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:r><w:t> 页</w:t></w:r>
  </w:p>
</w:ftr>"#
        .to_owned()
}

fn docx_styles_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun"/>
        <w:sz w:val="24"/><w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun"/>
      <w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="1800" w:after="280"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="180"/></w:pPr>
    <w:rPr><w:color w:val="666666"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ExportMeta">
    <w:name w:val="ExportMeta"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>
    <w:rPr><w:color w:val="666666"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TocEntry">
    <w:name w:val="TocEntry"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="80"/><w:ind w:left="420"/></w:pPr>
    <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="180" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="420"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="666666"/></w:rPr>
  </w:style>
</w:styles>"#
        .to_owned()
}

fn strip_markdown_inline(text: &str) -> String {
    text.replace("**", "").replace('`', "")
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn read_optional_project_file(root: &Path, relative_path: &str) -> Result<String, ProjectError> {
    let path = ensure_project_path(root, relative_path)?;
    Ok(fs::read_to_string(path).unwrap_or_default())
}

fn read_framework_files(root: &Path) -> Result<String, ProjectError> {
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
            chunks.push(format!("### {name}\n\n{}", fs::read_to_string(&path)?));
        }
    }

    chunks.sort();
    Ok(chunks.join("\n\n"))
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

fn compose_framework_prompt(
    file_name: &str,
    author_input: &str,
    current_content: &str,
    confirmed_facts: &str,
    other_frameworks: &str,
) -> String {
    format!(
        "# 框架文档改写任务\n\n         目标文件：framework/{file_name}\n\n         ## 要求\n         1. 只输出 Markdown 正文，不要输出 JSON。\n         2. 保留作者输入中的核心设定，不要替作者做无依据改动。\n         3. 与已确认事实和其他框架文件保持一致。\n         4. 内容要可直接保存为 framework/{file_name}。\n\n         ## 作者输入\n\n{author_input}\n\n         ## 当前文件内容\n\n{current_content}\n\n         ## 已确认事实\n\n{confirmed_facts}\n\n         ## 其他框架参考\n\n{other_frameworks}\n\n         请输出更新后的 framework/{file_name} 内容。"
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
        "故事前提"
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

fn compose_blueprint_prompt(
    chapter_id: &str,
    chapter_content: &str,
    author_input: &str,
    chapter_author_input: &str,
    current_blueprint: &str,
    confirmed_facts: &str,
    author_confirmation: &str,
    open_loops: &str,
    framework: &str,
) -> String {
    format!(
        "# 章节蓝图改写任务\n\n         目标章节：{chapter_id}\n\n         ## 要求\n         1. 只输出章节蓝图 Markdown，不要输出 JSON。\n         2. 明确本章目标、必须发生、禁止提前、伏笔安排和写作提示。\n         3. 尊重已确认正文、事实库和作者确认链。\n         4. 不要提前解决后续章节的冲突或谜题。\n         5. 如果当前正文已有内容，请围绕正文修正蓝图，不要推翻作者确认内容。\n\n         ## 当前正文\n\n{chapter_content}\n\n         ## 全局作者输入\n\n{author_input}\n\n         ## 本章作者输入\n\n{chapter_author_input}\n\n         ## 当前蓝图\n\n{current_blueprint}\n\n         ## 作者确认链\n\n{author_confirmation}\n\n         ## 已确认事实\n\n{confirmed_facts}\n\n         ## 未闭合伏笔\n\n{open_loops}\n\n         ## 框架参考\n\n{framework}\n\n         请输出更新后的章节蓝图。"
    )
}

fn local_blueprint_draft(
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

fn save_chapter_side_file(
    root_path: String,
    chapter_id: String,
    folder: &str,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("{folder}/{id}.md");
    let path = ensure_project_path(&root, &relative_path)?;
    atomic_write_text(&path, &content)?;

    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

fn backup_existing_blueprint(root: &Path, chapter_id: &str) -> Result<(), ProjectError> {
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

fn backup_existing_candidate(root: &Path, chapter_id: &str) -> Result<(), ProjectError> {
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
    Ok(())
}

fn cascade_following_blueprints(root: &Path, chapter_id: &str) -> Result<(), ProjectError> {
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

fn following_blueprint_template(chapter: u32, source_chapter_id: &str) -> String {
    let source_label = if source_chapter_id == "000" {
        "前置章节".to_owned()
    } else {
        format!("第 {source_chapter_id} 章更新")
    };
    format!(
        "# 第 {chapter} 章蓝图\n\n         ## 级联说明\n\n         因{source_label}，本章蓝图需要重新确认。\n\n         ## 本章目标\n\n         - 待补充。\n\n         ## 必须发生\n\n         - 请根据新的前文状态重新确认。\n         - 不要推翻已确认正文和事实库。\n\n         ## 禁止提前\n\n         - 不要提前解决后续章节冲突。\n\n         ## 写作提示\n\n         请重新装配任务书后再生成候选稿。\n"
    )
}

fn write_blueprint_cascade_log(
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

fn scaffold_project(root: &Path, project: &ProjectYaml) -> Result<(), ProjectError> {
    fs::create_dir_all(root)?;
    atomic_write_text(&root.join("project.yaml"), &serde_yaml::to_string(project)?)?;
    for dir in [
        "framework",
        "blueprints/chapters",
        "blueprints/history",
        "manuscript/chapters",
        "manuscript/drafts",
        "manuscript/candidates/reviews",
        "manuscript/candidates/history",
        "manuscript/author-input",
        "facts/history",
        "timeline",
        "skills/selected",
        "knowledge/markdown/imported",
        "characters/cards",
        "tasks/writing-briefs",
        "tasks/pinned-context",
        "logs/model-calls",
        "logs/confirmations",
        "exports",
        ".olienta",
        ".olienta-events/commits",
        "models",
    ] {
        fs::create_dir_all(root.join(dir))?;
    }

    write_if_missing(root, "framework/01-setting.md", "# 小说设置\n\n")?;
    write_if_missing(root, "framework/02-premise.md", "# 故事前提\n\n")?;
    write_if_missing(root, "framework/03-characters.md", "# 角色图谱\n\n")?;
    migrate_legacy_framework_file(root, "framework/05-plot.md", "framework/04-plot-outline.md")?;
    migrate_legacy_framework_file(root, "framework/04-world.md", "framework/05-world.md")?;
    write_if_missing(root, "framework/04-plot-outline.md", "# 情节大纲\n\n")?;
    write_if_missing(root, "framework/05-world.md", "# 世界观\n\n")?;
    write_if_missing(root, "framework/06-style.md", "# 文风配置\n\n")?;
    write_if_missing(root, "facts/confirmed-facts.md", "# 已确认事实\n\n")?;
    write_if_missing(root, "facts/author-confirmation.md", "# 作者确认边界\n\n")?;
    write_if_missing(root, "facts/open-loops.md", "# 未闭合伏笔\n\n")?;
    write_if_missing(root, "facts/character-facts.md", "# 角色事实\n\n")?;
    write_if_missing(root, "facts/time-facts.md", "# 时间事实\n\n")?;
    write_if_missing(root, "facts/event-facts.md", "# 已发生事件\n\n")?;
    write_if_missing(root, "facts/location-facts.md", "# 地点事实\n\n")?;
    write_if_missing(root, "facts/relation-facts.md", "# 关系事实\n\n")?;
    write_if_missing(root, "facts/world-rules.md", "# 世界规则\n\n")?;
    write_if_missing(root, "facts/forbidden-rules.md", "# 禁止违背\n\n")?;
    write_if_missing(root, "timeline/events.md", "# 时间线事件\n\n")?;
    write_if_missing(root, "timeline/milestones.md", "# 里程碑\n\n")?;
    write_if_missing(
        root,
        "knowledge/README.md",
        "# 知识库\n\n导入资料、事实、伏笔、角色和检索索引都保存在本地文件夹中。\n",
    )?;
    write_if_missing(
        root,
        "knowledge/markdown/README.md",
        "# 本地 Markdown\n\n这里保存作者导入或整理的 Markdown/TXT 资料。\n",
    )?;
    write_if_missing(
        root,
        "knowledge/search/README.md",
        "# 本地全文检索\n\n检索结果可以钉选进当前章节任务书。\n",
    )?;
    write_if_missing(
        root,
        "characters/cards/README.md",
        "# 角色卡\n\n从角色图谱抽取的角色卡会保存在这里。\n",
    )?;
    write_if_missing(root, "characters/cards/INDEX.md", "# 角色卡索引\n\n")?;
    write_if_missing(root, "characters/relations.md", "# 关系图谱\n\n")?;
    write_if_missing(root, "characters/growth.md", "# 角色成长线\n\n")?;
    write_if_missing(root, "tasks/history.jsonl", "")?;
    write_if_missing(root, "tasks/current.json", "{}\n")?;
    write_if_missing(root, "logs/system-events.jsonl", "")?;
    write_if_missing(
        root,
        "logs/model-calls/README.md",
        "# 模型调用\n\n这里记录 Provider 测试和 AI 调用历史。\n",
    )?;
    write_if_missing(root, "logs/model-calls/history.md", "# 模型调用记录\n\n")?;
    write_if_missing(
        root,
        "models/README.md",
        "# 模型调用\n\nAI Provider 配置保存在 `.olienta/ai-providers.json`。\n",
    )?;
    write_if_missing(
        root,
        ".olienta/ai-providers.json",
        &serde_json::to_string_pretty(&serde_json::json!([{
            "id": "openai-compatible-default",
            "name": "OpenAI-compatible",
            "kind": "OpenAI-compatible",
            "enabled": false,
            "baseUrl": "https://api.openai.com/v1",
            "apiKey": "",
            "model": "gpt-4o-mini",
            "temperature": 0.7,
            "useCases": ["chapter", "blueprint", "framework"]
        }]))?,
    )?;
    write_if_missing(
        root,
        ".olienta/writing-methodology.json",
        &serde_json::to_string_pretty(&serde_json::json!({
            "pressureRelease": null,
            "hookTypes": [],
            "antiAiFlavor": true
        }))?,
    )?;
    write_if_missing(
        root,
        ".olienta/timeline-settings.json",
        &serde_json::to_string_pretty(&serde_json::json!({
            "enabled": false,
            "conflictCheck": false,
            "storage": "local-folder"
        }))?,
    )?;

    for chapter in 1..=project.chapter_count {
        let id = format!("{chapter:03}");
        write_if_missing(
            root,
            &format!("manuscript/chapters/{id}.md"),
            &format!("# 第 {chapter} 章未命名\n\n"),
        )?;
        write_if_missing(
            root,
            &format!("manuscript/drafts/{id}.md"),
            &format!("# 第 {chapter} 章草稿\n\n"),
        )?;
        write_if_missing(
            root,
            &format!("manuscript/author-input/{id}.md"),
            &format!("# 第 {chapter} 章作者输入\n\n"),
        )?;
        write_if_missing(
            root,
            &format!("blueprints/chapters/{id}.md"),
            &format!(
                "# 第 {chapter} 章蓝图\n\n## 本章目标\n\n## 必须发生\n\n## 禁止提前\n\n## 备注\n\n"
            ),
        )?;
    }

    Ok(())
}

fn update_author_confirmation(root: &Path) -> Result<(), ProjectError> {
    let chapters_dir = ensure_project_path(root, "manuscript/chapters")?;
    let mut entries = Vec::new();

    if chapters_dir.exists() {
        for entry in fs::read_dir(chapters_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let content = fs::read_to_string(&path)?;
            if is_placeholder_or_empty(&content) {
                continue;
            }

            let chapter_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            let title = content
                .lines()
                .find(|line| line.trim_start().starts_with('#'))
                .map(|line| line.trim_start_matches('#').trim())
                .filter(|title| !title.is_empty())
                .unwrap_or("未命名章节");

            entries.push(format!(
                "- {chapter_id}《{title}》：{} 字",
                count_words(&content)
            ));
        }
    }

    entries.sort();
    let content = if entries.is_empty() {
        "# 作者确认链\n\n".to_owned()
    } else {
        "# 作者确认链\n\n以下章节已保存为作者确认正文，后续 AI 生成必须尊重。\n\n".to_owned()
    };
    let content = format!("{content}{}\n", entries.join("\n"));
    let target = ensure_project_path(root, "facts/author-confirmation.md")?;
    atomic_write_text(&target, &content)?;
    Ok(())
}

fn write_chapter_commit(root: &Path, chapter_id: &str, content: &str) -> Result<(), ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let relative_path = format!(".olienta-events/commits/{timestamp}-{chapter_id}.json");
    let target = ensure_project_path(root, &relative_path)?;
    let commit = serde_json::json!({
        "kind": "chapter_saved",
        "chapterId": chapter_id,
        "wordCount": count_words(content),
        "createdAtUnix": timestamp
    });
    atomic_write_text(&target, &serde_json::to_string_pretty(&commit)?)?;
    Ok(())
}

fn append_system_event(
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

fn append_workflow_task_history(
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

fn write_if_missing(root: &Path, relative_path: &str, content: &str) -> Result<(), ProjectError> {
    let target = ensure_project_path(root, relative_path)?;
    if !target.exists() {
        atomic_write_text(&target, content)?;
    }
    Ok(())
}

fn migrate_legacy_framework_file(
    root: &Path,
    legacy_relative_path: &str,
    current_relative_path: &str,
) -> Result<(), ProjectError> {
    let legacy = ensure_project_path(root, legacy_relative_path)?;
    let current = ensure_project_path(root, current_relative_path)?;
    if legacy.exists() && !current.exists() {
        let content = fs::read_to_string(legacy)?;
        atomic_write_text(&current, &content)?;
    }
    Ok(())
}

fn read_summary(root: &Path) -> Result<ProjectSummary, ProjectError> {
    let project = read_project_yaml(root)?;
    Ok(ProjectSummary {
        name: project.name,
        root_path: root.canonicalize()?.to_string_lossy().to_string(),
        language: project.language,
        chapter_count: project.chapter_count,
    })
}

fn read_project_yaml(root: &Path) -> Result<ProjectYaml, ProjectError> {
    let path = ensure_project_path(root, "project.yaml")?;
    let content = fs::read_to_string(path)?;
    Ok(serde_yaml::from_str(&content)?)
}

fn fallback_project_yaml(root: &Path) -> ProjectYaml {
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("未命名作品")
        .to_owned();

    ProjectYaml {
        name,
        language: "zh-CN".to_owned(),
        template: "blank".to_owned(),
        storage: "local-files".to_owned(),
        chapter_count: 1,
        target_words_per_chapter: 3000,
    }
}

fn fallback_language(language: &str) -> String {
    if language.trim().is_empty() {
        "zh-CN".to_owned()
    } else {
        language.trim().to_owned()
    }
}

fn normalize_chapter_id(chapter_id: &str) -> String {
    let digits: String = chapter_id
        .chars()
        .filter(|value| value.is_ascii_digit())
        .collect();
    let number = digits.parse::<u32>().unwrap_or(1).max(1);
    format!("{number:03}")
}

fn count_words(content: &str) -> usize {
    content
        .chars()
        .filter(|value| !value.is_whitespace())
        .count()
}

fn is_placeholder_or_empty(content: &str) -> bool {
    let body = content
        .lines()
        .filter(|line| !line.trim_start().starts_with('#'))
        .collect::<Vec<_>>()
        .join("")
        .trim()
        .to_owned();

    body.is_empty() || body.contains("正文待写")
}

fn extract_title(content: &str) -> Option<String> {
    content
        .lines()
        .find(|line| line.trim_start().starts_with('#'))
        .map(|line| line.trim_start_matches('#').trim().to_owned())
        .filter(|title| !title.is_empty())
}

fn is_editable_module_markdown(relative_path: &str) -> bool {
    if relative_path.starts_with("characters/cards/") && relative_path.ends_with(".md") {
        return true;
    }
    if relative_path.starts_with("tasks/writing-briefs/") && relative_path.ends_with(".md") {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read;

    fn create_temp_project(chapter_count: u32) -> (tempfile::TempDir, std::path::PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("novel");
        create_project(CreateProjectInput {
            name: "测试作品".to_owned(),
            root_path: root.to_string_lossy().to_string(),
            language: "zh-CN".to_owned(),
            chapter_count,
            target_words_per_chapter: 3000,
            template: "blank".to_owned(),
        })
        .unwrap();
        (temp, root)
    }

    #[test]
    fn project_scaffold_creates_external_markdown_vault() {
        let (_temp, root) = create_temp_project(3);

        assert!(root.join("framework/02-premise.md").exists());
        assert!(root.join("framework/03-characters.md").exists());
        assert!(root.join("framework/04-plot-outline.md").exists());
        assert!(root.join("framework/05-world.md").exists());
        assert!(!root.join("framework/04-world.md").exists());
        assert!(!root.join("framework/05-plot.md").exists());
        assert!(root.join("knowledge/README.md").exists());
        assert!(root.join("knowledge/markdown/README.md").exists());
        assert!(root.join("knowledge/search/README.md").exists());
        assert!(root.join("blueprints/chapters/001.md").exists());
        assert!(root.join("manuscript/drafts/001.md").exists());
        assert!(root.join("manuscript/chapters/001.md").exists());
        assert!(root.join("facts/confirmed-facts.md").exists());
        assert!(root.join("facts/time-facts.md").exists());
        assert!(root.join("facts/relation-facts.md").exists());
        assert!(root.join("facts/world-rules.md").exists());
        assert!(root.join("facts/forbidden-rules.md").exists());
        assert!(root.join("characters/cards/README.md").exists());
        assert!(root.join("logs/model-calls/README.md").exists());
        assert!(root.join(".olienta/ai-providers.json").exists());

        let chapters = list_chapters(root.to_string_lossy().to_string()).unwrap();
        assert_eq!(chapters[0].state, "待写");

        let health = inspect_project_health(root.to_string_lossy().to_string()).unwrap();
        assert!(health.ready);
        assert_eq!(health.missing_count, 0);
        assert_eq!(health.warning_count, 0);
    }

    #[test]
    fn open_project_migrates_legacy_framework_file_names() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("legacy-novel");
        fs::create_dir_all(root.join("framework")).unwrap();
        fs::write(
            root.join("framework/04-world.md"),
            "# 旧世界观\n\n保留世界设定。",
        )
        .unwrap();
        fs::write(
            root.join("framework/05-plot.md"),
            "# 旧情节大纲\n\n保留情节设计。",
        )
        .unwrap();

        open_project(root.to_string_lossy().to_string()).unwrap();

        assert!(
            fs::read_to_string(root.join("framework/04-plot-outline.md"))
                .unwrap()
                .contains("保留情节设计")
        );
        assert!(fs::read_to_string(root.join("framework/05-world.md"))
            .unwrap()
            .contains("保留世界设定"));
    }

    #[test]
    fn module_markdown_save_is_restricted_to_auxiliary_files() {
        let (_temp, root) = create_temp_project(1);

        let saved = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "characters/relations.md".to_owned(),
            "# 关系图谱\n\n- A 与 B 冲突。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved.relative_path, "characters/relations.md");
        assert!(saved.content.contains("A 与 B"));

        let saved_fact = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "facts/character-facts.md".to_owned(),
            "# 角色事实\n\n- 杨志远第一次出场在第 1 章。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved_fact.relative_path, "facts/character-facts.md");

        let saved_brief = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "tasks/writing-briefs/001.md".to_owned(),
            "# 第001章 写作任务书\n\n- 作者手动补充任务边界。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved_brief.relative_path, "tasks/writing-briefs/001.md");
        assert!(saved_brief.content.contains("作者手动补充任务边界"));

        let blocked = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "manuscript/chapters/001.md".to_owned(),
            "# 绕过正文确认\n\n".to_owned(),
        );
        assert!(blocked.is_err());
    }

    #[test]
    fn forbidden_rules_are_editable_knowledge_file() {
        let (_temp, root) = create_temp_project(1);

        let saved = save_knowledge_file(
            root.to_string_lossy().to_string(),
            "forbidden-rules".to_owned(),
            "# 禁止违背\n\n- 不得否定作者确认正文。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved.relative_path, "facts/forbidden-rules.md");

        let loaded = load_knowledge_file(
            root.to_string_lossy().to_string(),
            "forbidden-rules".to_owned(),
        )
        .unwrap();
        assert_eq!(loaded.relative_path, "facts/forbidden-rules.md");
        assert!(loaded.content.contains("不得否定作者确认正文"));
    }

    #[test]
    fn provider_selection_respects_order_and_use_case() {
        let (_temp, root) = create_temp_project(1);
        fs::write(
            root.join(".olienta/ai-providers.json"),
            r#"[
  {
    "id": "disabled",
    "name": "Disabled",
    "kind": "openai-compatible",
    "enabled": false,
    "baseUrl": "https://example.invalid/v1",
    "apiKey": "sk-disabled",
    "model": "disabled-model",
    "useCases": ["chapter"]
  },
  {
    "id": "blueprint-first",
    "name": "Blueprint First",
    "kind": "openai-compatible",
    "enabled": true,
    "baseUrl": "https://example.invalid/v1",
    "apiKey": "sk-blueprint",
    "model": "blueprint-model",
    "useCases": ["blueprint"]
  },
  {
    "id": "chapter-second",
    "name": "Chapter Second",
    "kind": "openai-compatible",
    "enabled": true,
    "baseUrl": "https://example.invalid/v1",
    "apiKey": "sk-chapter",
    "model": "chapter-model",
    "useCases": ["chapter"]
  }
]"#,
        )
        .unwrap();

        let chapter = select_provider_for_use_case(&root, &["chapter"])
            .unwrap()
            .unwrap();
        assert_eq!(chapter.id.as_deref(), Some("chapter-second"));

        let blueprint = select_provider_for_use_case(&root, &["blueprint"])
            .unwrap()
            .unwrap();
        assert_eq!(blueprint.id.as_deref(), Some("blueprint-first"));

        assert!(select_provider_for_use_case(&root, &["facts"])
            .unwrap()
            .is_none());
    }

    #[test]
    fn imports_reference_file_into_project_knowledge_folder() {
        let (temp, root) = create_temp_project(1);
        let source = temp.path().join("外部资料.md");
        fs::write(&source, "# 外部资料\n\n这是一段可进入全文检索的作者资料。").unwrap();

        let imported = import_reference_file(
            root.to_string_lossy().to_string(),
            source.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(
            imported.relative_path,
            "knowledge/markdown/imported/外部资料.md"
        );
        assert!(imported.content.contains("全文检索"));
        assert!(root
            .join("knowledge/markdown/imported/外部资料.md")
            .exists());
    }

    #[test]
    fn save_chapter_updates_confirmation_and_commit_log() {
        let (_temp, root) = create_temp_project(1);

        let saved = save_chapter(
            root.to_string_lossy().to_string(),
            "1".to_owned(),
            "# 第一章\n\n杨志远在深圳诊所整理 2019 年的现金流水。".to_owned(),
        )
        .unwrap();

        assert_eq!(saved.chapter_id, "001");
        assert!(saved.word_count > 0);
        assert!(
            fs::read_to_string(root.join("facts/author-confirmation.md"))
                .unwrap()
                .contains("001")
        );
        let confirmed_facts = fs::read_to_string(root.join("facts/confirmed-facts.md")).unwrap();
        assert!(confirmed_facts.contains("来源：第 001 章《第一章》，段落 2"));
        assert!(confirmed_facts.contains("杨志远在深圳诊所整理 2019 年的现金流水"));
        let time_facts = fs::read_to_string(root.join("facts/time-facts.md")).unwrap();
        assert!(time_facts.contains("# 时间事实"));
        assert!(time_facts.contains("提到年份：2019"));
        assert!(time_facts.contains("来源：第 001 章《第一章》，段落 2"));
        let location_facts = fs::read_to_string(root.join("facts/location-facts.md")).unwrap();
        assert!(location_facts.contains("# 地点事实"));
        assert!(location_facts.contains("提到关键词：深圳"));
        assert!(location_facts.contains("来源：第 001 章《第一章》，段落 2"));
        assert!(fs::read_to_string(root.join("logs/system-events.jsonl"))
            .unwrap()
            .contains("chapter_saved"));
    }

    #[test]
    fn candidate_draft_stays_separate_from_confirmed_manuscript() {
        let (_temp, root) = create_temp_project(1);

        save_candidate(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "作者修改后的候选稿。".to_owned(),
        )
        .unwrap();
        let candidate =
            load_candidate(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        let manuscript =
            load_chapter(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();

        assert!(candidate.content.contains("候选稿"));
        assert!(!manuscript.content.contains("候选稿"));
    }

    #[test]
    fn writing_flow_keeps_candidate_author_gated_until_confirmed_save() {
        let (_temp, root) = create_temp_project(1);

        save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "facts/confirmed-facts.md".to_owned(),
            "# 已确认事实\n\n- 主角只能在作者确认后改变既定关系。".to_owned(),
        )
        .unwrap();
        save_author_input(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章作者输入\n\n必须写到本地资料里的“雨夜收据”。".to_owned(),
        )
        .unwrap();
        save_blueprint(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章蓝图\n\n## 本章目标\n\n主角发现第一条可验证线索。\n\n## 禁止提前发生\n\n不得直接揭示最终真相。".to_owned(),
        )
        .unwrap();

        let brief = pin_search_result_to_writing_brief(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "knowledge/markdown/imported/source.md".to_owned(),
            7,
            "雨夜收据显示转账时间早于公开说法。".to_owned(),
        )
        .unwrap();
        assert_eq!(brief.relative_path, "tasks/writing-briefs/001.md");
        assert!(brief.content.contains("钉选检索材料"));
        assert!(brief.content.contains("雨夜收据"));

        let pinned =
            list_pinned_context(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(pinned.len(), 1);
        assert_eq!(
            pinned[0].source_path,
            "knowledge/markdown/imported/source.md"
        );

        let draft =
            generate_candidate_draft(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(draft.relative_path, "manuscript/candidates/001.md");
        assert_eq!(draft.writing_brief_path, "tasks/writing-briefs/001.md");
        assert!(draft.review_path.ends_with("001.md"));
        assert!(draft.content.contains("候选稿"));
        let review_report = fs::read_to_string(root.join(&draft.review_path)).unwrap();
        assert!(review_report.contains("# 第 001 章候选稿审查"));
        assert!(review_report.contains("### 生成与任务书"));

        let before_adoption = fs::read_to_string(root.join("manuscript/chapters/001.md")).unwrap();
        assert!(!before_adoption.contains("候选稿"));

        let confirmation = record_candidate_adoption(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "replace".to_owned(),
            draft.relative_path.clone(),
            "manuscript/chapters/001.md".to_owned(),
        )
        .unwrap();
        assert_eq!(confirmation.relative_path, "logs/confirmations/001.md");
        assert!(confirmation.content.contains("采用方式：replace"));

        save_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            draft.content.clone(),
        )
        .unwrap();
        let confirmed = load_chapter(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert!(confirmed.content.contains("候选稿"));
        assert!(
            fs::read_to_string(root.join("facts/author-confirmation.md"))
                .unwrap()
                .contains("001")
        );

        let exported = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "markdown".to_owned(),
            scope: Some("chapter".to_owned()),
            chapter_id: Some("001".to_owned()),
            chapter_ids: None,
        })
        .unwrap();
        assert_eq!(exported.relative_path, "exports/chapter-001.md");
        assert!(exported.content.contains("候选稿"));

        let events = fs::read_to_string(root.join("logs/system-events.jsonl")).unwrap();
        assert!(events.contains("candidate_adopted"));
        assert!(events.contains("chapter_saved"));
        let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
        assert!(task_history.contains("search_result_pinned_to_brief"));
        assert!(task_history.contains("writing_brief_composed"));
        assert!(task_history.contains("candidate_draft_generated"));
    }

    #[test]
    fn core_writing_workflow_smoke_covers_project_to_confirmed_manuscript() {
        let (_temp, root) = create_temp_project(2);
        let root_path = root.to_string_lossy().to_string();

        let opened = open_project(root_path.clone()).unwrap();
        assert_eq!(opened.chapter_count, 2);

        fs::create_dir_all(root.join("knowledge/markdown/imported")).unwrap();
        fs::write(
            root.join("knowledge/markdown/imported/rain-receipt.md"),
            "# Rain Receipt\n\nRainReceipt clue proves the transfer happened before dawn.\n",
        )
        .unwrap();

        save_author_input(
            root_path.clone(),
            "001".to_owned(),
            "# Chapter input\n\nUse RainReceipt as the concrete evidence.\n".to_owned(),
        )
        .unwrap();
        save_blueprint(
            root_path.clone(),
            "001".to_owned(),
            "# Chapter 001 blueprint\n\n## Must happen\n\n- The protagonist checks RainReceipt.\n\n## Forbidden\n\n- Do not solve the final mystery.\n".to_owned(),
        )
        .unwrap();
        save_module_markdown_file(
            root_path.clone(),
            "facts/forbidden-rules.md".to_owned(),
            "# Forbidden rules\n\n- Do not contradict confirmed manuscript.\n".to_owned(),
        )
        .unwrap();

        let search_results = search_project_text_files_scoped(
            root_path.clone(),
            "RainReceipt".to_owned(),
            "all".to_owned(),
        )
        .unwrap();
        assert!(search_results
            .iter()
            .any(|result| result.relative_path == "knowledge/markdown/imported/rain-receipt.md"));
        let imported_result = search_results
            .iter()
            .find(|result| result.relative_path == "knowledge/markdown/imported/rain-receipt.md")
            .unwrap();

        let brief = pin_search_results_to_writing_brief(
            root_path.clone(),
            "001".to_owned(),
            vec![PinSearchResultInput {
                source_path: imported_result.relative_path.clone(),
                line_number: imported_result.line_number,
                snippet: imported_result.snippet.clone(),
            }],
        )
        .unwrap();
        assert_eq!(brief.relative_path, "tasks/writing-briefs/001.md");
        assert!(brief.content.contains("RainReceipt"));
        assert!(brief.content.contains("manuscript/candidates/001.md"));

        let pinned = list_pinned_context(root_path.clone(), "001".to_owned()).unwrap();
        assert_eq!(pinned.len(), 1);
        assert_eq!(
            pinned[0].source_path,
            "knowledge/markdown/imported/rain-receipt.md"
        );

        let draft = generate_candidate_draft(root_path.clone(), "001".to_owned()).unwrap();
        assert_eq!(draft.relative_path, "manuscript/candidates/001.md");
        assert_eq!(draft.writing_brief_path, "tasks/writing-briefs/001.md");
        assert!(root.join(&draft.relative_path).exists());
        assert!(root.join(&draft.review_path).exists());
        assert!(draft.content.contains("tasks/writing-briefs/001.md"));

        let manuscript_before = load_chapter(root_path.clone(), "001".to_owned()).unwrap();
        assert!(!manuscript_before
            .content
            .contains("tasks/writing-briefs/001.md"));

        let adoption = record_candidate_adoption(
            root_path.clone(),
            "001".to_owned(),
            "replace".to_owned(),
            draft.relative_path.clone(),
            "manuscript/chapters/001.md".to_owned(),
        )
        .unwrap();
        assert_eq!(adoption.relative_path, "logs/confirmations/001.md");

        let saved =
            save_chapter(root_path.clone(), "001".to_owned(), draft.content.clone()).unwrap();
        assert_eq!(saved.chapter_id, "001");
        assert!(saved.word_count > 0);

        let chapters = list_chapters(root_path.clone()).unwrap();
        assert_eq!(chapters[0].state, "已确认");
        assert!(chapters[0].words > 0);

        let exported = export_manuscript(ExportInput {
            root_path: root_path.clone(),
            format: "markdown".to_owned(),
            scope: Some("selected".to_owned()),
            chapter_id: None,
            chapter_ids: Some(vec!["001".to_owned()]),
        })
        .unwrap();
        assert_eq!(exported.relative_path, "exports/selected-chapters.md");
        assert!(exported.content.contains("tasks/writing-briefs/001.md"));

        let health = inspect_project_health(root_path.clone()).unwrap();
        assert!(health.ready);

        let events = fs::read_to_string(root.join("logs/system-events.jsonl")).unwrap();
        assert!(events.contains("candidate_adopted"));
        assert!(events.contains("chapter_saved"));
        let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
        assert!(task_history.contains("search_results_pinned_to_brief"));
        assert!(task_history.contains("writing_brief_composed"));
        assert!(task_history.contains("candidate_draft_generated"));
    }

    #[test]
    fn search_scope_batch_pin_and_remove_recompose_writing_brief() {
        let (_temp, root) = create_temp_project(1);

        fs::create_dir_all(root.join("knowledge/markdown/imported")).unwrap();
        fs::write(
            root.join("knowledge/markdown/imported/source-a.md"),
            "# 资料 A\n\n雨夜收据显示第一笔转账发生在凌晨。\n",
        )
        .unwrap();
        fs::write(
            root.join("framework/02-premise.md"),
            "# 故事前提\n\n雨夜收据不是公开线索，而是私密证据。\n",
        )
        .unwrap();
        fs::write(
            root.join("manuscript/chapters/001.md"),
            "# 第一章\n\n正文里暂时没有那张雨夜收据。\n",
        )
        .unwrap();

        let imported_results = search_project_text_files_scoped(
            root.to_string_lossy().to_string(),
            "雨夜收据".to_owned(),
            "imported".to_owned(),
        )
        .unwrap();
        assert_eq!(imported_results.len(), 1);
        assert_eq!(
            imported_results[0].relative_path,
            "knowledge/markdown/imported/source-a.md"
        );

        let framework_results = search_project_text_files_scoped(
            root.to_string_lossy().to_string(),
            "雨夜收据".to_owned(),
            "framework".to_owned(),
        )
        .unwrap();
        assert!(framework_results
            .iter()
            .any(|result| result.relative_path == "framework/02-premise.md"));

        let manuscript_results = search_project_text_files_scoped(
            root.to_string_lossy().to_string(),
            "雨夜收据".to_owned(),
            "manuscript".to_owned(),
        )
        .unwrap();
        assert!(manuscript_results
            .iter()
            .any(|result| result.relative_path == "manuscript/chapters/001.md"));

        let brief = pin_search_results_to_writing_brief(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            vec![
                PinSearchResultInput {
                    source_path: imported_results[0].relative_path.clone(),
                    line_number: imported_results[0].line_number,
                    snippet: imported_results[0].snippet.clone(),
                },
                PinSearchResultInput {
                    source_path: framework_results[0].relative_path.clone(),
                    line_number: framework_results[0].line_number,
                    snippet: framework_results[0].snippet.clone(),
                },
            ],
        )
        .unwrap();
        assert!(brief.content.contains("钉选检索材料"));
        assert!(brief.content.contains("source-a.md"));

        let pinned =
            list_pinned_context(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(pinned.len(), 2);

        let recomposed =
            remove_pinned_context_item(root.to_string_lossy().to_string(), "001".to_owned(), 0)
                .unwrap();
        let pinned_after_remove =
            list_pinned_context(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(pinned_after_remove.len(), 1);
        assert!(!recomposed.content.contains("source-a.md"));
        assert!(recomposed.content.contains(&pinned_after_remove[0].snippet));

        let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
        assert!(task_history.contains("search_results_pinned_to_brief"));
        assert!(task_history.contains("pinned_context_removed"));
    }

    #[test]
    fn blueprint_draft_generation_does_not_save_file() {
        let (_temp, root) = create_temp_project(2);
        let before = fs::read_to_string(root.join("blueprints/chapters/001.md")).unwrap();

        let draft = generate_blueprint_draft(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "本章需要让主角第一次意识到关系可以被剥离。".to_owned(),
        )
        .unwrap();
        let after = fs::read_to_string(root.join("blueprints/chapters/001.md")).unwrap();

        assert_eq!(before, after);
        assert_eq!(draft.relative_path, "blueprints/chapters/001.md");
        assert!(!draft.content.trim().is_empty());
    }

    #[test]
    fn exports_markdown_txt_and_docx_without_modifying_chapters() {
        let (_temp, root) = create_temp_project(1);
        save_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章\n\n正文内容。".to_owned(),
        )
        .unwrap();

        let markdown = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "markdown".to_owned(),
            scope: None,
            chapter_id: None,
            chapter_ids: None,
        })
        .unwrap();
        let txt = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "txt".to_owned(),
            scope: None,
            chapter_id: None,
            chapter_ids: None,
        })
        .unwrap();
        let docx = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "docx".to_owned(),
            scope: None,
            chapter_id: None,
            chapter_ids: None,
        })
        .unwrap();

        assert_eq!(markdown.relative_path, "exports/manuscript.md");
        assert_eq!(txt.relative_path, "exports/manuscript.txt");
        assert_eq!(docx.relative_path, "exports/manuscript.docx");
        assert_eq!(
            fs::read_to_string(root.join("manuscript/chapters/001.md")).unwrap(),
            "# 第一章\n\n正文内容。"
        );
    }

    #[test]
    fn exports_selected_chapters_in_project_order() {
        let (_temp, root) = create_temp_project(3);
        save_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章\n\n第一章正文。".to_owned(),
        )
        .unwrap();
        save_chapter(
            root.to_string_lossy().to_string(),
            "003".to_owned(),
            "# 第三章\n\n第三章正文。".to_owned(),
        )
        .unwrap();

        let selected = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "markdown".to_owned(),
            scope: Some("selected".to_owned()),
            chapter_id: None,
            chapter_ids: Some(vec!["003".to_owned(), "001".to_owned()]),
        })
        .unwrap();

        assert_eq!(selected.relative_path, "exports/selected-chapters.md");
        assert!(selected.content.contains("# 测试作品 选中章节"));
        assert!(selected.content.contains("第一章正文。"));
        assert!(selected.content.contains("第三章正文。"));
        assert!(
            selected.content.find("第一章正文。").unwrap()
                < selected.content.find("第三章正文。").unwrap()
        );
        assert!(!selected.content.contains("第 2 章未命名"));
    }

    #[test]
    fn docx_export_includes_manuscript_layout_parts() {
        let bytes = markdown_to_docx(
            "# 测试作品\n\n第一段正文。\n\n# 第二章\n\n第二章正文。\n\n> 引用内容\n\n- 列表项",
        )
        .unwrap();

        let content_types = read_docx_part(&bytes, "[Content_Types].xml");
        let relationships = read_docx_part(&bytes, "word/_rels/document.xml.rels");
        let document = read_docx_part(&bytes, "word/document.xml");
        let styles = read_docx_part(&bytes, "word/styles.xml");
        let header = read_docx_part(&bytes, "word/header1.xml");
        let footer = read_docx_part(&bytes, "word/footer1.xml");

        assert!(content_types.contains("/word/header1.xml"));
        assert!(content_types.contains("/word/footer1.xml"));
        assert!(relationships.contains("relationships/header"));
        assert!(relationships.contains("relationships/footer"));
        assert!(document.contains("w:headerReference"));
        assert!(document.contains("w:footerReference"));
        assert!(document.contains("w:pageBreakBefore"));
        assert!(document.contains(r#"<w:pStyle w:val="Title"/>"#));
        assert!(document.contains(r#"<w:pStyle w:val="TocEntry"/>"#));
        assert!(document.contains("目录"));
        assert!(document.contains("章节数：2"));
        assert!(document.contains("字数："));
        assert!(document.contains("1. 测试作品"));
        assert!(document.contains("2. 第二章"));
        assert!(document.contains(r#"<w:br w:type="page"/>"#));
        assert!(styles.contains(r#"w:eastAsia="SimSun""#));
        assert!(styles.contains(r#"w:line="360""#));
        assert!(styles.contains(r#"w:styleId="Title""#));
        assert!(styles.contains(r#"w:styleId="TocEntry""#));
        assert!(header.contains("Olienta 作品导出"));
        assert!(footer.contains(" PAGE "));
    }

    #[test]
    fn timeline_events_can_be_loaded_and_saved() {
        let (_temp, root) = create_temp_project(3);

        save_timeline_events(
            root.to_string_lossy().to_string(),
            "# 时间线事件\n\n- 第 1 章：主角得到第一条线索。".to_owned(),
        )
        .unwrap();

        let loaded = load_timeline_events(root.to_string_lossy().to_string()).unwrap();
        assert_eq!(loaded.relative_path, "timeline/events.md");
        assert!(loaded.content.contains("第一条线索"));
    }

    fn read_docx_part(bytes: &[u8], name: &str) -> String {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes.to_vec())).unwrap();
        let mut file = archive.by_name(name).unwrap();
        let mut text = String::new();
        file.read_to_string(&mut text).unwrap();
        text
    }
}

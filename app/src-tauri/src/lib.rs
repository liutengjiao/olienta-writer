mod fs_safety;
mod project_ai_providers;
mod project_blueprints;
mod project_candidate_review;
mod project_candidates;
mod project_chapters;
mod project_events;
mod project_export;
mod project_files;
mod project_framework;
mod project_health;
mod project_imports;
mod project_core;
mod project_knowledge;
mod project_model;
mod project_skills;
mod project_timeline;
mod project_types;
mod project_volumes;
mod recent_projects;
mod sample_project;

use project_model::{
    AiChatInput, AiChatResult, BlueprintHistorySummary, CandidateDraft,
    CandidateFactAdoptionResult, CandidateReviewIssue, ChapterDocument, ChapterSummary,
    CreateProjectInput, DeconstructionImportResult, ExportInput, FrameworkFileSummary,
    ImportReferenceBatchResult, MarkdownFileSummary, PinSearchResultInput, PinnedContextItem,
    ProjectFileDocument, ProjectHealthReport, ProjectSearchResult, ProjectSummary,
    ProjectVaultEntry, ProviderBatchTestResult, ProviderTestResult, SkillFileSummary,
    TimelineSettings, VolumeInfo, WritingBrief,
};
use recent_projects::RecentProject;

macro_rules! reject_sample_mutation {
    ($root_path:expr) => {
        if sample_project::is_sample_project($root_path.as_str()) {
            return Err(sample_project::readonly_error());
        }
    };
}

#[tauri::command]
fn create_project(input: CreateProjectInput) -> Result<ProjectSummary, String> {
    project_model::create_project(input).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_project(root_path: String) -> Result<ProjectSummary, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::open_project());
    }
    project_model::open_project(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_known_projects() -> Result<Vec<ProjectSummary>, String> {
    project_model::list_known_projects().map_err(|error| error.to_string())
}

#[tauri::command]
fn list_chapters(root_path: String) -> Result<Vec<ChapterSummary>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::list_chapters());
    }
    project_model::list_chapters(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_volumes(root_path: String) -> Result<Vec<VolumeInfo>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_volumes());
    }
    project_volumes::load_volumes(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_volumes(root_path: String, volumes: Vec<VolumeInfo>) -> Result<Vec<VolumeInfo>, String> {
    reject_sample_mutation!(root_path);
    project_volumes::save_volumes(root_path, volumes).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_chapter(root_path: String, chapter_id: String) -> Result<ChapterDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_chapter(&chapter_id));
    }
    project_model::load_chapter(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ChapterDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::save_chapter(root_path, chapter_id, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_chapter_markdown(
    root_path: String,
    chapter_id: String,
    source_path: String,
) -> Result<ChapterDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::import_chapter_markdown(root_path, chapter_id, source_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn read_imported_document(source_path: String) -> Result<String, String> {
    project_model::read_imported_document(source_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_author_input(root_path: String, chapter_id: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_author_input(&chapter_id));
    }
    project_model::load_author_input(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_author_input(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::save_author_input(root_path, chapter_id, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_blueprint(root_path: String, chapter_id: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_blueprint(&chapter_id));
    }
    project_model::load_blueprint(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_blueprint(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::save_blueprint(root_path, chapter_id, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_candidate(root_path: String, chapter_id: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_candidate(&chapter_id));
    }
    project_model::load_candidate(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_candidate(
    root_path: String,
    chapter_id: String,
    content: String,
    restored_from_history_path: Option<String>,
    restored_from_confirmation_path: Option<String>,
    restored_from_confirmation_entry_id: Option<String>,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    if restored_from_history_path.is_none()
        && restored_from_confirmation_path.is_none()
        && restored_from_confirmation_entry_id.is_none()
    {
        return project_model::save_candidate(root_path, chapter_id, content)
            .map_err(|error| error.to_string());
    }
    project_model::save_candidate_with_restore_source(
        root_path,
        chapter_id,
        content,
        restored_from_history_path,
        restored_from_confirmation_path,
        restored_from_confirmation_entry_id,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn generate_blueprint_draft(
    root_path: String,
    chapter_id: String,
    author_input: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::generate_blueprint_draft(root_path, chapter_id, author_input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn regenerate_following_blueprints(
    root_path: String,
    chapter_id: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::regenerate_following_blueprints(root_path, chapter_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn regenerate_all_blueprints(root_path: String) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::regenerate_all_blueprints(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_blueprint_history(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<BlueprintHistorySummary>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(Vec::new());
    }
    project_model::list_blueprint_history(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_blueprint_history(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(ProjectFileDocument {
            relative_path,
            content: "# 示例历史版本\n\n示例项目没有真实历史版本。".to_owned(),
        });
    }
    project_model::load_blueprint_history(root_path, relative_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_candidate_history(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<BlueprintHistorySummary>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(Vec::new());
    }
    project_model::list_candidate_history(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_candidate_history(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(ProjectFileDocument {
            relative_path,
            content: "# 示例候选稿历史\n\n示例项目没有真实候选稿历史。".to_owned(),
        });
    }
    project_model::load_candidate_history(root_path, relative_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn record_candidate_history_restore(
    root_path: String,
    chapter_id: String,
    history_path: String,
    candidate_path: String,
    confirmation_path: Option<String>,
    confirmation_entry_id: Option<String>,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::record_candidate_history_restore(
        root_path,
        chapter_id,
        history_path,
        candidate_path,
        confirmation_path,
        confirmation_entry_id,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn compose_writing_brief(root_path: String, chapter_id: String) -> Result<WritingBrief, String> {
    reject_sample_mutation!(root_path);
    project_model::compose_writing_brief(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn generate_candidate_draft(
    root_path: String,
    chapter_id: String,
    request_id: Option<String>,
) -> Result<CandidateDraft, String> {
    reject_sample_mutation!(root_path);
    project_model::generate_candidate_draft_with_request_id(root_path, chapter_id, request_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_ai_request(request_id: String) -> Result<bool, String> {
    project_model::cancel_ai_request(request_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn ai_chat(input: AiChatInput) -> Result<AiChatResult, String> {
    if sample_project::is_sample_project(&input.root_path) {
        return Err(sample_project::readonly_error());
    }
    project_model::ai_chat(input).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_agent_chat_history(root_path: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(ProjectFileDocument {
            relative_path: ".olienta/chat-history.json".to_owned(),
            content: "{}".to_owned(),
        });
    }
    project_model::load_agent_chat_history(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_agent_chat_history(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::save_agent_chat_history(root_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn review_candidate_draft(content: String) -> Vec<CandidateReviewIssue> {
    project_model::review_candidate_draft_issues(content)
}

#[tauri::command]
fn review_candidate_draft_for_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<Vec<CandidateReviewIssue>, String> {
    reject_sample_mutation!(root_path);
    project_model::review_candidate_draft_issues_for_chapter(root_path, chapter_id, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn record_candidate_adoption(
    root_path: String,
    chapter_id: String,
    mode: String,
    candidate_path: String,
    manuscript_path: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::record_candidate_adoption(
        root_path,
        chapter_id,
        mode,
        candidate_path,
        manuscript_path,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn export_manuscript(input: ExportInput) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&input.root_path) {
        return Err(sample_project::readonly_error());
    }
    project_export::export_manuscript(input).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_knowledge_file(root_path: String, kind: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_knowledge_file(&kind));
    }
    project_model::load_knowledge_file(root_path, kind).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_knowledge_file(
    root_path: String,
    kind: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::save_knowledge_file(root_path, kind, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn adopt_candidate_fact_draft(
    root_path: String,
    draft_path: String,
) -> Result<CandidateFactAdoptionResult, String> {
    reject_sample_mutation!(root_path);
    project_model::adopt_candidate_fact_draft(root_path, draft_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_ai_providers(root_path: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_ai_providers());
    }
    project_model::load_ai_providers(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_ai_providers(root_path: String, content: String) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::save_ai_providers(root_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn test_ai_provider(root_path: String) -> Result<ProviderTestResult, String> {
    reject_sample_mutation!(root_path);
    project_model::test_ai_provider(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn test_ai_providers(root_path: String) -> Result<ProviderBatchTestResult, String> {
    reject_sample_mutation!(root_path);
    project_model::test_ai_providers(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_framework_files(root_path: String) -> Result<Vec<FrameworkFileSummary>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::list_framework_files());
    }
    project_model::list_framework_files(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_framework_file(
    root_path: String,
    file_name: String,
) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_framework_file(&file_name));
    }
    project_model::load_framework_file(root_path, file_name).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_framework_file(
    root_path: String,
    file_name: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::save_framework_file(root_path, file_name, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn generate_framework_draft(
    root_path: String,
    file_name: String,
    author_input: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::generate_framework_draft(root_path, file_name, author_input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_timeline_events(root_path: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(ProjectFileDocument {
            relative_path: "timeline/events.md".to_owned(),
            content: "# 时间线事件\n\n- 2017：示例项目开始。\n- 2024：示例项目进入剥离阶段。\n".to_owned(),
        });
    }
    project_timeline::load_timeline_events(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_timeline_events(root_path: String, content: String) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_timeline::save_timeline_events(root_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_timeline_milestones(root_path: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(ProjectFileDocument {
            relative_path: "timeline/milestones.md".to_owned(),
            content: "# 里程碑\n\n- 诊所开业。\n- 关系压力显形。\n- 商业系统失控。\n".to_owned(),
        });
    }
    project_timeline::load_timeline_milestones(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_timeline_milestones(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_timeline::save_timeline_milestones(root_path, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_timeline_settings(root_path: String) -> Result<TimelineSettings, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(TimelineSettings {
            enabled: false,
            conflict_check: false,
            storage: "sample".to_owned(),
        });
    }
    project_timeline::load_timeline_settings(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_project_markdown_files(root_path: String) -> Result<Vec<MarkdownFileSummary>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::list_project_markdown_files());
    }
    project_files::list_project_markdown_files(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_project_vault_entries(root_path: String) -> Result<Vec<ProjectVaultEntry>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::list_project_vault_entries());
    }
    project_files::list_project_vault_entries(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn inspect_project_health(root_path: String) -> Result<ProjectHealthReport, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::inspect_project_health());
    }
    project_health::inspect_project_health(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn repair_project_structure(root_path: String) -> Result<ProjectHealthReport, String> {
    reject_sample_mutation!(root_path);
    project_health::repair_project_structure(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_project_folder(root_path: String) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_health::reveal_project_folder(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_project_path(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_health::reveal_project_path(root_path, relative_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_reference_file(
    root_path: String,
    source_path: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_imports::import_reference_file(root_path, source_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_reference_file_with_deconstruction(
    root_path: String,
    source_path: String,
) -> Result<DeconstructionImportResult, String> {
    reject_sample_mutation!(root_path);
    project_imports::import_reference_file_with_deconstruction(root_path, source_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_reference_directory(
    root_path: String,
    source_path: String,
) -> Result<ImportReferenceBatchResult, String> {
    reject_sample_mutation!(root_path);
    project_imports::import_reference_directory(root_path, source_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_project_markdown_file(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_project_markdown_file(&relative_path));
    }
    project_files::load_project_markdown_file(root_path, relative_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn search_project_text_files(
    root_path: String,
    query: String,
) -> Result<Vec<ProjectSearchResult>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(Vec::new());
    }
    project_files::search_project_text_files(root_path, query).map_err(|error| error.to_string())
}

#[tauri::command]
fn search_project_text_files_scoped(
    root_path: String,
    query: String,
    scope: String,
) -> Result<Vec<ProjectSearchResult>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(Vec::new());
    }
    project_files::search_project_text_files_scoped(root_path, query, scope)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn pin_search_result_to_writing_brief(
    root_path: String,
    chapter_id: String,
    source_path: String,
    line_number: usize,
    snippet: String,
) -> Result<WritingBrief, String> {
    reject_sample_mutation!(root_path);
    project_model::pin_search_result_to_writing_brief(
        root_path,
        chapter_id,
        source_path,
        line_number,
        snippet,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn pin_search_results_to_writing_brief(
    root_path: String,
    chapter_id: String,
    results: Vec<PinSearchResultInput>,
) -> Result<WritingBrief, String> {
    reject_sample_mutation!(root_path);
    project_model::pin_search_results_to_writing_brief(root_path, chapter_id, results)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_pinned_context(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<PinnedContextItem>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(Vec::new());
    }
    project_model::list_pinned_context(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_pinned_context_item(
    root_path: String,
    chapter_id: String,
    index: usize,
) -> Result<WritingBrief, String> {
    reject_sample_mutation!(root_path);
    project_model::remove_pinned_context_item(root_path, chapter_id, index)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_module_markdown_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_files::save_module_markdown_file(root_path, relative_path, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn extract_character_cards(root_path: String) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::extract_character_cards(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn rescan_facts(root_path: String) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::rescan_facts(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn regenerate_knowledge_file(
    root_path: String,
    kind: String,
    author_input: Option<String>,
) -> Result<ProjectFileDocument, String> {
    reject_sample_mutation!(root_path);
    project_model::regenerate_knowledge_file(root_path, kind, author_input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_selected_skills(root_path: String) -> Result<Vec<SkillFileSummary>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::list_selected_skills());
    }
    project_model::list_selected_skills(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_skill_file(root_path: String, source_path: String) -> Result<SkillFileSummary, String> {
    reject_sample_mutation!(root_path);
    project_model::import_skill_file(root_path, source_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_skill_disabled(
    root_path: String,
    file_name: String,
    disabled: bool,
) -> Result<Vec<SkillFileSummary>, String> {
    reject_sample_mutation!(root_path);
    project_model::set_skill_disabled(root_path, file_name, disabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_temporary_skill(
    root_path: String,
    file_name: String,
    temporary: bool,
) -> Result<Vec<SkillFileSummary>, String> {
    reject_sample_mutation!(root_path);
    project_model::set_temporary_skill(root_path, file_name, temporary)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn analyze_skill_conflicts(root_path: String) -> Result<Vec<String>, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(Vec::new());
    }
    project_model::analyze_skill_conflicts(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_skill_file(root_path: String, file_name: String) -> Result<ProjectFileDocument, String> {
    if sample_project::is_sample_project(&root_path) {
        return Ok(sample_project::load_skill_file(&file_name));
    }
    project_model::load_skill_file(root_path, file_name).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    recent_projects::load_recent_projects(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn remember_recent_project(
    app: tauri::AppHandle,
    project: RecentProject,
) -> Result<Vec<RecentProject>, String> {
    recent_projects::remember_recent_project(&app, project).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("only http and https URLs can be opened".to_owned());
    }
    tauri_plugin_opener::open_url(trimmed, None::<&str>).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn sample_project_read_commands_return_mock_data() {
        let project = open_project(sample_project::SAMPLE_ROOT.to_owned()).unwrap();
        assert_eq!(project.root_path, sample_project::SAMPLE_ROOT);
        assert_eq!(project.name, "无痛剥离");

        let chapters = list_chapters(sample_project::SAMPLE_ROOT.to_owned()).unwrap();
        assert!(!chapters.is_empty());
        assert_eq!(chapters[0].id, "001");
    }

    #[test]
    fn sample_project_write_and_ai_commands_are_rejected() {
        let save_error = save_chapter(
            sample_project::SAMPLE_ROOT.to_owned(),
            "001".to_owned(),
            "new content".to_owned(),
        )
        .unwrap_err();
        assert!(save_error.contains("示例项目不支持"));

        let ai_error = ai_chat(AiChatInput {
            root_path: sample_project::SAMPLE_ROOT.to_owned(),
            chapter_id: Some("001".to_owned()),
            context_kind: Some("chapter".to_owned()),
            active_view: Some("manuscript".to_owned()),
            request_id: None,
            client_context: None,
            messages: vec![project_model::AiChatMessage {
                role: "user".to_owned(),
                content: "继续写".to_owned(),
            }],
        })
        .unwrap_err();
        assert!(ai_error.contains("示例项目不支持"));
    }

    #[test]
    fn backend_command_surface_smoke_for_real_project() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let smoke_root = std::env::current_dir()
            .unwrap()
            .join("..")
            .join("..")
            .join("..")
            .join("olienta-backend-smoke");
        let _ = fs::remove_dir_all(&smoke_root);
        let base = smoke_root.join(format!("run-{stamp}"));
        fs::create_dir_all(&base).unwrap();
        let root = base.join("novel");
        fs::create_dir_all(&root).unwrap();
        let root_path = root.canonicalize().unwrap().to_string_lossy().to_string();

        let created = create_project(CreateProjectInput {
            name: "Backend Smoke Novel".to_owned(),
            root_path: root_path.clone(),
            language: "zh-CN".to_owned(),
            chapter_count: 60,
            target_words_per_chapter: 6000,
            template: "blank".to_owned(),
        })
        .unwrap();
        assert_eq!(created.chapter_count, 60);
        assert!(open_project(root_path.clone()).unwrap().root_path.contains("novel"));
        assert_eq!(list_chapters(root_path.clone()).unwrap().len(), 60);

        let saved_volumes = save_volumes(
            root_path.clone(),
            vec![
                VolumeInfo {
                    id: "v1".to_owned(),
                    title: "Arc One".to_owned(),
                    start_chapter: 1,
                    end_chapter: 20,
                    summary: "opening pressure".to_owned(),
                },
                VolumeInfo {
                    id: "v2".to_owned(),
                    title: "Arc Two".to_owned(),
                    start_chapter: 21,
                    end_chapter: 40,
                    summary: "middle reversal".to_owned(),
                },
                VolumeInfo {
                    id: "v3".to_owned(),
                    title: "Arc Three".to_owned(),
                    start_chapter: 41,
                    end_chapter: 60,
                    summary: "final choice".to_owned(),
                },
            ],
        )
        .unwrap();
        assert_eq!(saved_volumes[2].end_chapter, 60);
        assert_eq!(load_volumes(root_path.clone()).unwrap()[1].start_chapter, 21);

        let author_input = save_author_input(
            root_path.clone(),
            "001".to_owned(),
            "# Author input\n\nA compact scene seed.".to_owned(),
        )
        .unwrap();
        assert_eq!(author_input.relative_path, "manuscript/author-input/001.md");
        let blueprint = save_blueprint(
            root_path.clone(),
            "001".to_owned(),
            "# Blueprint\n\nThe protagonist makes a visible decision.".to_owned(),
        )
        .unwrap();
        assert!(blueprint.content.contains("visible decision"));
        let chapter = save_chapter(
            root_path.clone(),
            "001".to_owned(),
            "# Chapter One\n\nThe decision is now on the page.".to_owned(),
        )
        .unwrap();
        assert!(chapter.word_count > 0);
        assert!(load_chapter(root_path.clone(), "001".to_owned())
            .unwrap()
            .content
            .contains("decision"));

        let generated_blueprint =
            generate_blueprint_draft(root_path.clone(), "002".to_owned(), "next turn".to_owned())
                .unwrap();
        assert_eq!(generated_blueprint.relative_path, "blueprints/chapters/002.md");
        assert!(regenerate_following_blueprints(root_path.clone(), "002".to_owned()).is_ok());
        assert!(regenerate_all_blueprints(root_path.clone()).is_ok());
        assert!(!list_blueprint_history(root_path.clone(), "002".to_owned())
            .unwrap()
            .is_empty());

        let brief = compose_writing_brief(root_path.clone(), "001".to_owned()).unwrap();
        assert_eq!(brief.chapter_id, "001");
        let candidate = generate_candidate_draft(root_path.clone(), "001".to_owned(), None).unwrap();
        assert_eq!(candidate.chapter_id, "001");
        assert!(!candidate.content.trim().is_empty());
        let saved_candidate = save_candidate(
            root_path.clone(),
            "001".to_owned(),
            candidate.content.clone(),
            None,
            None,
            None,
        )
        .unwrap();
        assert_eq!(saved_candidate.relative_path, "manuscript/candidates/001.md");
        let candidate_history = list_candidate_history(root_path.clone(), "001".to_owned()).unwrap();
        assert!(!candidate_history.is_empty());
        let loaded_history = load_candidate_history(
            root_path.clone(),
            candidate_history[0].relative_path.clone(),
        )
        .unwrap();
        assert!(!loaded_history.content.trim().is_empty());
        assert!(record_candidate_adoption(
            root_path.clone(),
            "001".to_owned(),
            "replace".to_owned(),
            saved_candidate.relative_path.clone(),
            "manuscript/chapters/001.md".to_owned(),
        )
        .unwrap()
        .content
        .contains("replace"));
        assert!(review_candidate_draft("One paragraph.\n\nAnother paragraph.".to_owned()).len() <= 32);
        assert!(review_candidate_draft_for_chapter(
            root_path.clone(),
            "001".to_owned(),
            "One paragraph.\n\nAnother paragraph.".to_owned(),
        )
        .is_ok());
        assert!(cancel_ai_request("missing-request".to_owned()).is_ok());

        let facts = save_knowledge_file(
            root_path.clone(),
            "confirmed-facts".to_owned(),
            "# Confirmed Facts\n\n- Chapter one happened.".to_owned(),
        )
        .unwrap();
        assert_eq!(facts.relative_path, "facts/confirmed-facts.md");
        assert!(load_knowledge_file(root_path.clone(), "confirmed-facts".to_owned())
            .unwrap()
            .content
            .contains("Chapter one"));
        assert!(rescan_facts(root_path.clone()).is_ok());
        assert!(regenerate_knowledge_file(
            root_path.clone(),
            "confirmed-facts".to_owned(),
            Some("Keep only confirmed manuscript events.".to_owned()),
        )
        .is_ok());

        let framework = save_framework_file(
            root_path.clone(),
            "03-characters.md".to_owned(),
            "# Characters\n\n## Ada\n\n- Role: lead\n- Wants control.\n".to_owned(),
        )
        .unwrap();
        assert_eq!(framework.relative_path, "framework/03-characters.md");
        assert!(list_framework_files(root_path.clone()).unwrap().len() >= 6);
        assert!(load_framework_file(root_path.clone(), "03-characters.md".to_owned())
            .unwrap()
            .content
            .contains("Ada"));
        assert!(generate_framework_draft(
            root_path.clone(),
            "04-plot-outline.md".to_owned(),
            "tighten the outline".to_owned(),
        )
        .is_ok());
        assert!(extract_character_cards(root_path.clone()).is_ok());

        assert!(save_timeline_events(
            root_path.clone(),
            "# Timeline\n\n- Day 1: opening.".to_owned(),
        )
        .is_ok());
        assert!(load_timeline_events(root_path.clone()).unwrap().content.contains("Day 1"));
        assert!(save_timeline_milestones(root_path.clone(), "# Milestones\n\n- Turn.".to_owned())
            .is_ok());
        assert!(load_timeline_milestones(root_path.clone())
            .unwrap()
            .content
            .contains("Turn"));
        assert_eq!(load_timeline_settings(root_path.clone()).unwrap().storage, "local-folder");

        let source_md = base.join("reference.md");
        fs::write(&source_md, "# Reference\n\nA reusable note.").unwrap();
        let imported = import_reference_file(root_path.clone(), source_md.to_string_lossy().to_string())
            .unwrap();
        assert!(imported.relative_path.ends_with("reference.md"));
        assert!(read_imported_document(source_md.to_string_lossy().to_string())
            .unwrap()
            .contains("Reference"));
        let import_dir = base.join("refs");
        fs::create_dir_all(&import_dir).unwrap();
        fs::write(import_dir.join("one.md"), "# One").unwrap();
        fs::write(import_dir.join("two.txt"), "two").unwrap();
        assert_eq!(
            import_reference_directory(root_path.clone(), import_dir.to_string_lossy().to_string())
                .unwrap()
                .imported_count,
            2
        );

        let markdown_files = list_project_markdown_files(root_path.clone()).unwrap();
        assert!(markdown_files
            .iter()
            .any(|file| file.relative_path == "manuscript/chapters/001.md"));
        assert!(!list_project_vault_entries(root_path.clone()).unwrap().is_empty());
        assert!(load_project_markdown_file(
            root_path.clone(),
            "manuscript/chapters/001.md".to_owned(),
        )
        .unwrap()
        .content
        .contains("decision"));
        let search_results = search_project_text_files(root_path.clone(), "decision".to_owned()).unwrap();
        assert!(!search_results.is_empty());
        assert!(!search_project_text_files_scoped(
            root_path.clone(),
            "decision".to_owned(),
            "manuscript".to_owned(),
        )
        .unwrap()
        .is_empty());
        assert!(pin_search_result_to_writing_brief(
            root_path.clone(),
            "001".to_owned(),
            "manuscript/chapters/001.md".to_owned(),
            3,
            "The decision is now on the page.".to_owned(),
        )
        .unwrap()
        .content
        .contains("decision"));
        assert_eq!(list_pinned_context(root_path.clone(), "001".to_owned()).unwrap().len(), 1);
        assert!(pin_search_results_to_writing_brief(
            root_path.clone(),
            "001".to_owned(),
            vec![PinSearchResultInput {
                source_path: "blueprints/001.md".to_owned(),
                line_number: 1,
                snippet: "The protagonist makes a visible decision.".to_owned(),
            }],
        )
        .is_ok());
        assert!(remove_pinned_context_item(root_path.clone(), "001".to_owned(), 0).is_ok());
        assert!(save_module_markdown_file(
            root_path.clone(),
            "facts/forbidden-rules.md".to_owned(),
            "# Forbidden Rules".to_owned(),
        )
        .is_ok());

        let skill_source = base.join("style-skill.md");
        fs::write(
            &skill_source,
            "# Style Skill\n\n## Purpose\nKeep prose concrete.\n\nTags: style, chapter\n",
        )
        .unwrap();
        let skill = import_skill_file(root_path.clone(), skill_source.to_string_lossy().to_string())
            .unwrap();
        assert_eq!(skill.name, "style-skill.md");
        assert!(!list_selected_skills(root_path.clone()).unwrap().is_empty());
        assert!(set_skill_disabled(root_path.clone(), skill.name.clone(), true)
            .unwrap()
            .iter()
            .any(|item| item.name == skill.name && item.disabled));
        assert!(set_temporary_skill(root_path.clone(), skill.name.clone(), true)
            .unwrap()
            .iter()
            .any(|item| item.name == skill.name && item.temporary));
        assert!(analyze_skill_conflicts(root_path.clone()).is_ok());
        assert!(load_skill_file(root_path.clone(), skill.name.clone())
            .unwrap()
            .content
            .contains("Style Skill"));

        assert!(save_ai_providers(root_path.clone(), "[]".to_owned()).is_ok());
        assert_eq!(load_ai_providers(root_path.clone()).unwrap().content.trim(), "[]");
        let provider_batch = test_ai_providers(root_path.clone()).unwrap();
        assert_eq!(provider_batch.total, provider_batch.results.len());

        assert!(export_manuscript(ExportInput {
            root_path: root_path.clone(),
            format: "md".to_owned(),
            scope: Some("all".to_owned()),
            chapter_id: None,
            chapter_ids: None,
        })
        .unwrap()
        .relative_path
        .starts_with("exports/"));
        assert!(inspect_project_health(root_path.clone()).unwrap().ready);
        assert!(repair_project_structure(root_path).unwrap().ready);
        let _ = fs::remove_dir_all(&smoke_root);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            list_known_projects,
            list_chapters,
            load_volumes,
            save_volumes,
            load_chapter,
            save_chapter,
            import_chapter_markdown,
            read_imported_document,
            load_author_input,
            save_author_input,
            load_blueprint,
            save_blueprint,
            load_candidate,
            save_candidate,
            generate_blueprint_draft,
            regenerate_all_blueprints,
            regenerate_following_blueprints,
            list_blueprint_history,
            load_blueprint_history,
            list_candidate_history,
            load_candidate_history,
            record_candidate_history_restore,
            compose_writing_brief,
            generate_candidate_draft,
            cancel_ai_request,
            ai_chat,
            load_agent_chat_history,
            save_agent_chat_history,
            review_candidate_draft,
            review_candidate_draft_for_chapter,
            record_candidate_adoption,
            export_manuscript,
            load_knowledge_file,
            save_knowledge_file,
            adopt_candidate_fact_draft,
            load_ai_providers,
            save_ai_providers,
            test_ai_provider,
            test_ai_providers,
            load_recent_projects,
            remember_recent_project,
            open_external_url,
            list_framework_files,
            load_framework_file,
            save_framework_file,
            generate_framework_draft,
            load_timeline_events,
            save_timeline_events,
            load_timeline_milestones,
            save_timeline_milestones,
            load_timeline_settings,
            list_project_markdown_files,
            list_project_vault_entries,
            inspect_project_health,
            repair_project_structure,
            reveal_project_folder,
            reveal_project_path,
            import_reference_file,
            import_reference_file_with_deconstruction,
            import_reference_directory,
            load_project_markdown_file,
            search_project_text_files,
            search_project_text_files_scoped,
            pin_search_result_to_writing_brief,
            pin_search_results_to_writing_brief,
            list_pinned_context,
            remove_pinned_context_item,
            save_module_markdown_file,
            extract_character_cards,
            rescan_facts,
            regenerate_knowledge_file,
            list_selected_skills,
            import_skill_file,
            set_skill_disabled,
            set_temporary_skill,
            analyze_skill_conflicts,
            load_skill_file
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Olienta");
}

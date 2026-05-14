mod fs_safety;
mod project_model;
mod recent_projects;

use project_model::{
    BlueprintHistorySummary, CandidateDraft, ChapterDocument, ChapterSummary, CreateProjectInput,
    ExportInput, FrameworkFileSummary, ImportReferenceBatchResult, MarkdownFileSummary,
    PinSearchResultInput, PinnedContextItem, ProjectFileDocument, ProjectHealthReport,
    ProjectSearchResult, ProjectSummary, ProjectVaultEntry, ProviderTestResult, SkillFileSummary,
    TimelineSettings, WritingBrief,
};
use recent_projects::RecentProject;

#[tauri::command]
fn create_project(input: CreateProjectInput) -> Result<ProjectSummary, String> {
    project_model::create_project(input).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_project(root_path: String) -> Result<ProjectSummary, String> {
    project_model::open_project(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_chapters(root_path: String) -> Result<Vec<ChapterSummary>, String> {
    project_model::list_chapters(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_chapter(root_path: String, chapter_id: String) -> Result<ChapterDocument, String> {
    project_model::load_chapter(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ChapterDocument, String> {
    project_model::save_chapter(root_path, chapter_id, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_author_input(root_path: String, chapter_id: String) -> Result<ProjectFileDocument, String> {
    project_model::load_author_input(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_author_input(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    project_model::save_author_input(root_path, chapter_id, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_blueprint(root_path: String, chapter_id: String) -> Result<ProjectFileDocument, String> {
    project_model::load_blueprint(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_blueprint(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    project_model::save_blueprint(root_path, chapter_id, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_candidate(root_path: String, chapter_id: String) -> Result<ProjectFileDocument, String> {
    project_model::load_candidate(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_candidate(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    project_model::save_candidate(root_path, chapter_id, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn generate_blueprint_draft(
    root_path: String,
    chapter_id: String,
    author_input: String,
) -> Result<ProjectFileDocument, String> {
    project_model::generate_blueprint_draft(root_path, chapter_id, author_input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn regenerate_following_blueprints(
    root_path: String,
    chapter_id: String,
) -> Result<ProjectFileDocument, String> {
    project_model::regenerate_following_blueprints(root_path, chapter_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn regenerate_all_blueprints(root_path: String) -> Result<ProjectFileDocument, String> {
    project_model::regenerate_all_blueprints(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_blueprint_history(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<BlueprintHistorySummary>, String> {
    project_model::list_blueprint_history(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_blueprint_history(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    project_model::load_blueprint_history(root_path, relative_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_candidate_history(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<BlueprintHistorySummary>, String> {
    project_model::list_candidate_history(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_candidate_history(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    project_model::load_candidate_history(root_path, relative_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn compose_writing_brief(root_path: String, chapter_id: String) -> Result<WritingBrief, String> {
    project_model::compose_writing_brief(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn generate_candidate_draft(
    root_path: String,
    chapter_id: String,
) -> Result<CandidateDraft, String> {
    project_model::generate_candidate_draft(root_path, chapter_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn review_candidate_draft(content: String) -> Vec<String> {
    project_model::review_candidate_draft(content)
}

#[tauri::command]
fn review_candidate_draft_for_chapter(
    root_path: String,
    chapter_id: String,
    content: String,
) -> Result<Vec<String>, String> {
    project_model::review_candidate_draft_for_chapter(root_path, chapter_id, content)
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
    project_model::export_manuscript(input).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_knowledge_file(root_path: String, kind: String) -> Result<ProjectFileDocument, String> {
    project_model::load_knowledge_file(root_path, kind).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_knowledge_file(
    root_path: String,
    kind: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    project_model::save_knowledge_file(root_path, kind, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_ai_providers(root_path: String) -> Result<ProjectFileDocument, String> {
    project_model::load_ai_providers(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_ai_providers(root_path: String, content: String) -> Result<ProjectFileDocument, String> {
    project_model::save_ai_providers(root_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn test_ai_provider(root_path: String) -> Result<ProviderTestResult, String> {
    project_model::test_ai_provider(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_framework_files(root_path: String) -> Result<Vec<FrameworkFileSummary>, String> {
    project_model::list_framework_files(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_framework_file(
    root_path: String,
    file_name: String,
) -> Result<ProjectFileDocument, String> {
    project_model::load_framework_file(root_path, file_name).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_framework_file(
    root_path: String,
    file_name: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    project_model::save_framework_file(root_path, file_name, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn generate_framework_draft(
    root_path: String,
    file_name: String,
    author_input: String,
) -> Result<ProjectFileDocument, String> {
    project_model::generate_framework_draft(root_path, file_name, author_input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_timeline_events(root_path: String) -> Result<ProjectFileDocument, String> {
    project_model::load_timeline_events(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_timeline_events(root_path: String, content: String) -> Result<ProjectFileDocument, String> {
    project_model::save_timeline_events(root_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_timeline_settings(root_path: String) -> Result<TimelineSettings, String> {
    project_model::load_timeline_settings(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_project_markdown_files(root_path: String) -> Result<Vec<MarkdownFileSummary>, String> {
    project_model::list_project_markdown_files(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_project_vault_entries(root_path: String) -> Result<Vec<ProjectVaultEntry>, String> {
    project_model::list_project_vault_entries(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn inspect_project_health(root_path: String) -> Result<ProjectHealthReport, String> {
    project_model::inspect_project_health(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn repair_project_structure(root_path: String) -> Result<ProjectHealthReport, String> {
    project_model::repair_project_structure(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_project_folder(root_path: String) -> Result<ProjectFileDocument, String> {
    project_model::reveal_project_folder(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_project_path(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    project_model::reveal_project_path(root_path, relative_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_reference_file(
    root_path: String,
    source_path: String,
) -> Result<ProjectFileDocument, String> {
    project_model::import_reference_file(root_path, source_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_reference_directory(
    root_path: String,
    source_path: String,
) -> Result<ImportReferenceBatchResult, String> {
    project_model::import_reference_directory(root_path, source_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_project_markdown_file(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, String> {
    project_model::load_project_markdown_file(root_path, relative_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn search_project_text_files(
    root_path: String,
    query: String,
) -> Result<Vec<ProjectSearchResult>, String> {
    project_model::search_project_text_files(root_path, query).map_err(|error| error.to_string())
}

#[tauri::command]
fn search_project_text_files_scoped(
    root_path: String,
    query: String,
    scope: String,
) -> Result<Vec<ProjectSearchResult>, String> {
    project_model::search_project_text_files_scoped(root_path, query, scope)
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
    project_model::pin_search_results_to_writing_brief(root_path, chapter_id, results)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_pinned_context(
    root_path: String,
    chapter_id: String,
) -> Result<Vec<PinnedContextItem>, String> {
    project_model::list_pinned_context(root_path, chapter_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_pinned_context_item(
    root_path: String,
    chapter_id: String,
    index: usize,
) -> Result<WritingBrief, String> {
    project_model::remove_pinned_context_item(root_path, chapter_id, index)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_module_markdown_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<ProjectFileDocument, String> {
    project_model::save_module_markdown_file(root_path, relative_path, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn extract_character_cards(root_path: String) -> Result<ProjectFileDocument, String> {
    project_model::extract_character_cards(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn rescan_facts(root_path: String) -> Result<ProjectFileDocument, String> {
    project_model::rescan_facts(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_selected_skills(root_path: String) -> Result<Vec<SkillFileSummary>, String> {
    project_model::list_selected_skills(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_skill_file(root_path: String, source_path: String) -> Result<SkillFileSummary, String> {
    project_model::import_skill_file(root_path, source_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_skill_disabled(
    root_path: String,
    file_name: String,
    disabled: bool,
) -> Result<Vec<SkillFileSummary>, String> {
    project_model::set_skill_disabled(root_path, file_name, disabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_temporary_skill(
    root_path: String,
    file_name: String,
    temporary: bool,
) -> Result<Vec<SkillFileSummary>, String> {
    project_model::set_temporary_skill(root_path, file_name, temporary)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn analyze_skill_conflicts(root_path: String) -> Result<Vec<String>, String> {
    project_model::analyze_skill_conflicts(root_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_skill_file(root_path: String, file_name: String) -> Result<ProjectFileDocument, String> {
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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            list_chapters,
            load_chapter,
            save_chapter,
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
            compose_writing_brief,
            generate_candidate_draft,
            review_candidate_draft,
            review_candidate_draft_for_chapter,
            record_candidate_adoption,
            export_manuscript,
            load_knowledge_file,
            save_knowledge_file,
            load_ai_providers,
            save_ai_providers,
            test_ai_provider,
            load_recent_projects,
            remember_recent_project,
            list_framework_files,
            load_framework_file,
            save_framework_file,
            generate_framework_draft,
            load_timeline_events,
            save_timeline_events,
            load_timeline_settings,
            list_project_markdown_files,
            list_project_vault_entries,
            inspect_project_health,
            repair_project_structure,
            reveal_project_folder,
            reveal_project_path,
            import_reference_file,
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

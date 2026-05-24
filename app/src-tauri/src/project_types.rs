use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::fs_safety::FsSafetyError;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub id: String,
    pub title: String,
    pub start_chapter: u32,
    pub end_chapter: u32,
    #[serde(default)]
    pub summary: String,
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
pub struct DeconstructionImportResult {
    pub reference: ProjectFileDocument,
    pub deconstruction_path: String,
    pub skill_candidate_path: String,
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
    pub fact_draft_path: String,
    pub model_call_log_entry_id: Option<String>,
    pub content: String,
    pub warnings: Vec<String>,
    pub review_issues: Vec<CandidateReviewIssue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatContextItem {
    pub label: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatInput {
    pub root_path: String,
    pub chapter_id: Option<String>,
    pub context_kind: Option<String>,
    pub active_view: Option<String>,
    pub request_id: Option<String>,
    pub client_context: Option<Vec<AiChatContextItem>>,
    pub messages: Vec<AiChatMessage>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResult {
    pub content: String,
    pub provider: String,
    pub model: String,
    pub used_remote_model: bool,
    pub log_entry_id: Option<String>,
    pub context_snapshot_path: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CandidateReviewIssue {
    pub severity: String,
    pub category: String,
    pub location: String,
    pub description: String,
    pub evidence: String,
    pub fix_hint: String,
    pub blocking: bool,
}

#[derive(Debug, Serialize)]
pub struct CandidateFactAdoptionResult {
    pub draft_path: String,
    pub confirmed_facts: ProjectFileDocument,
    pub adopted_count: usize,
    pub skipped_count: usize,
    pub classified_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoryContractSummary {
    pub chapter_id: String,
    pub relative_path: String,
    pub required_count: usize,
    pub forbidden_count: usize,
    pub fact_count: usize,
    pub character_count: usize,
    pub timeline_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractFulfillmentSummary {
    pub chapter_id: String,
    pub contract_path: String,
    pub manuscript_path: String,
    pub markdown_path: String,
    pub json_path: String,
    pub revision_path: String,
    pub required_total: usize,
    pub fulfilled_required_count: usize,
    pub missing_required_count: usize,
    pub touched_forbidden_count: usize,
    pub referenced_fact_count: usize,
    pub score: usize,
    pub fulfilled_required: Vec<String>,
    pub missing_required: Vec<String>,
    pub touched_forbidden: Vec<String>,
    pub referenced_facts: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub ok: bool,
    pub provider: String,
    pub message: String,
    pub log_entry_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderBatchTestResult {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub results: Vec<ProviderTestResult>,
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
    pub category: String,
    pub conflict_tags: Vec<String>,
    pub scope: String,
}

#[derive(Debug, Serialize)]
pub struct BlueprintHistorySummary {
    pub name: String,
    pub relative_path: String,
    pub bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_time_ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub writing_brief_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_call_log_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_call_log_entry_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adoption_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adoption_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmation_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmation_entry_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restored_from_history_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restored_from_confirmation_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restored_from_confirmation_entry_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restored_at_ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateHistoryManifest {
    pub chapter_id: String,
    pub backup_time_ms: u128,
    pub candidate_path: String,
    pub history_path: String,
    pub writing_brief_path: String,
    pub revision_path: String,
    pub review_path: String,
    pub model_call_log_path: String,
    pub model_call_log_entry_id: Option<String>,
    pub adoption_status: Option<String>,
    pub adoption_mode: Option<String>,
    pub confirmation_path: Option<String>,
    pub confirmation_entry_id: Option<String>,
    pub restored_from_history_path: Option<String>,
    pub restored_from_confirmation_path: Option<String>,
    pub restored_from_confirmation_entry_id: Option<String>,
    pub restored_at_ms: Option<u128>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateConfirmationIndex {
    pub chapter_id: String,
    pub latest_confirmation_path: String,
    pub entries: Vec<CandidateConfirmationIndexEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateConfirmationIndexEntry {
    pub entry_id: Option<String>,
    pub created_at_ms: u128,
    pub adoption_status: String,
    pub adoption_mode: String,
    pub candidate_path: String,
    pub current_candidate_manifest_path: Option<String>,
    pub candidate_history_manifest_path: Option<String>,
    pub manuscript_path: String,
    pub confirmation_path: String,
    pub latest_confirmation_path: String,
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

pub(crate) struct DraftGenerationResult {
    pub(crate) content: String,
    pub(crate) source: String,
    pub(crate) fallback_reason: Option<String>,
    pub(crate) usage: Option<crate::project_ai_providers::ModelTokenUsage>,
    pub(crate) diagnostics: crate::project_ai_providers::ProviderCallDiagnostics,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ProjectYaml {
    pub(crate) name: String,
    #[serde(default = "default_project_language")]
    pub(crate) language: String,
    #[serde(default = "default_project_template")]
    pub(crate) template: String,
    #[serde(default = "default_project_storage")]
    pub(crate) storage: String,
    #[serde(default = "default_project_chapter_count")]
    pub(crate) chapter_count: u32,
    #[serde(default = "default_project_words_per_chapter")]
    pub(crate) target_words_per_chapter: u32,
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

fn default_project_language() -> String {
    "zh-CN".to_owned()
}

fn default_project_template() -> String {
    "blank".to_owned()
}

fn default_project_storage() -> String {
    "local-files".to_owned()
}

fn default_project_chapter_count() -> u32 {
    3
}

fn default_project_words_per_chapter() -> u32 {
    3000
}

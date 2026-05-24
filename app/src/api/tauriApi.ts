import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type {
  BlueprintHistorySummary,
  CandidateDraft,
  CandidateFactAdoptionResult,
  CandidateReviewIssue,
  AiChatInput,
  AiChatResult,
  ChapterDocument,
  ChapterSummary,
  CreateProjectInput,
  DeconstructionImportResult,
  ExportInput,
  FrameworkFileSummary,
  ImportReferenceBatchResult,
  MarkdownFileSummary,
  PinSearchResultInput,
  PinnedContextItem,
  ProjectFileDocument,
  ProjectHealthReport,
  ProjectSearchResult,
  ProjectSummary,
  ProjectVaultEntry,
  ProviderBatchTestResult,
  ProviderTestResult,
  RecentProject,
  SkillFileSummary,
  TimelineSettings,
  VolumeInfo,
  WritingBrief,
} from '../types'

export async function chooseProjectFolder() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择小说项目文件夹（建议放在 Olienta 软件目录外）',
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseSkillFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择 Skill Markdown 文件（.md / .markdown）',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseSkillFolder() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择 Skill 文件夹（包含 SKILL.md）',
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseReferenceFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择要导入到当前作品的 Markdown/TXT 资料',
    filters: [{ name: 'Markdown 或 TXT', extensions: ['md', 'markdown', 'txt'] }],
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseChapterMarkdownFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择要导入为当前章节正文的 Markdown/TXT 文件',
    filters: [{ name: 'Markdown 或 TXT', extensions: ['md', 'markdown', 'txt'] }],
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseNovelStructureFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择要导入到小说结构的 Markdown/TXT/Word 文件',
    filters: [{ name: 'Markdown、TXT 或 Word', extensions: ['md', 'markdown', 'txt', 'docx'] }],
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseBlueprintBundleFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择包含多章蓝图的 Markdown/TXT/Word 文件',
    filters: [{ name: 'Markdown、TXT 或 Word', extensions: ['md', 'markdown', 'txt', 'docx'] }],
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseReferenceFolder() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择要批量导入到当前作品的资料文件夹',
  })

  return typeof selected === 'string' ? selected : null
}

export function createProject(input: CreateProjectInput) {
  return invoke<ProjectSummary>('create_project', { input })
}

export function openProject(rootPath: string) {
  return invoke<ProjectSummary>('open_project', { rootPath })
}

export function listKnownProjects() {
  return invoke<ProjectSummary[]>('list_known_projects')
}

export function listChapters(rootPath: string) {
  return invoke<ChapterSummary[]>('list_chapters', { rootPath })
}

export function loadVolumes(rootPath: string) {
  return invoke<VolumeInfo[]>('load_volumes', { rootPath })
}

export function saveVolumes(rootPath: string, volumes: VolumeInfo[]) {
  return invoke<VolumeInfo[]>('save_volumes', { rootPath, volumes })
}

export function loadChapter(rootPath: string, chapterId: string) {
  return invoke<ChapterDocument>('load_chapter', { rootPath, chapterId })
}

export function saveChapter(rootPath: string, chapterId: string, content: string) {
  return invoke<ChapterDocument>('save_chapter', { rootPath, chapterId, content })
}

export function importChapterMarkdown(rootPath: string, chapterId: string, sourcePath: string) {
  return invoke<ChapterDocument>('import_chapter_markdown', { rootPath, chapterId, sourcePath })
}

export function readImportedDocument(sourcePath: string) {
  return invoke<string>('read_imported_document', { sourcePath })
}

export function loadAuthorInput(rootPath: string, chapterId: string) {
  return invoke<ProjectFileDocument>('load_author_input', { rootPath, chapterId })
}

export function saveAuthorInput(rootPath: string, chapterId: string, content: string) {
  return invoke<ProjectFileDocument>('save_author_input', { rootPath, chapterId, content })
}

export function loadBlueprint(rootPath: string, chapterId: string) {
  return invoke<ProjectFileDocument>('load_blueprint', { rootPath, chapterId })
}

export function saveBlueprint(rootPath: string, chapterId: string, content: string) {
  return invoke<ProjectFileDocument>('save_blueprint', { rootPath, chapterId, content })
}

export function loadCandidate(rootPath: string, chapterId: string) {
  return invoke<ProjectFileDocument>('load_candidate', { rootPath, chapterId })
}

export function saveCandidate(
  rootPath: string,
  chapterId: string,
  content: string,
  restoredFromHistoryPath?: string,
  restoredFromConfirmationPath?: string,
  restoredFromConfirmationEntryId?: string,
) {
  return invoke<ProjectFileDocument>('save_candidate', {
    rootPath,
    chapterId,
    content,
    restoredFromHistoryPath,
    restoredFromConfirmationPath,
    restoredFromConfirmationEntryId,
  })
}

export function generateBlueprintDraft(rootPath: string, chapterId: string, authorInput: string) {
  return invoke<ProjectFileDocument>('generate_blueprint_draft', { rootPath, chapterId, authorInput })
}

export function regenerateFollowingBlueprints(rootPath: string, chapterId: string) {
  return invoke<ProjectFileDocument>('regenerate_following_blueprints', { rootPath, chapterId })
}

export function regenerateAllBlueprints(rootPath: string) {
  return invoke<ProjectFileDocument>('regenerate_all_blueprints', { rootPath })
}

export function listBlueprintHistory(rootPath: string, chapterId: string) {
  return invoke<BlueprintHistorySummary[]>('list_blueprint_history', { rootPath, chapterId })
}

export function loadBlueprintHistory(rootPath: string, relativePath: string) {
  return invoke<ProjectFileDocument>('load_blueprint_history', { rootPath, relativePath })
}

export function listCandidateHistory(rootPath: string, chapterId: string) {
  return invoke<BlueprintHistorySummary[]>('list_candidate_history', { rootPath, chapterId })
}

export function loadCandidateHistory(rootPath: string, relativePath: string) {
  return invoke<ProjectFileDocument>('load_candidate_history', { rootPath, relativePath })
}

export function recordCandidateHistoryRestore(
  rootPath: string,
  chapterId: string,
  historyPath: string,
  candidatePath: string,
  confirmationPath?: string,
  confirmationEntryId?: string,
) {
  return invoke<ProjectFileDocument>('record_candidate_history_restore', {
    rootPath,
    chapterId,
    historyPath,
    candidatePath,
    confirmationPath,
    confirmationEntryId,
  })
}

export function composeWritingBrief(rootPath: string, chapterId: string) {
  return invoke<WritingBrief>('compose_writing_brief', { rootPath, chapterId })
}

export function generateCandidateDraft(rootPath: string, chapterId: string, requestId?: string) {
  return invoke<CandidateDraft>('generate_candidate_draft', { rootPath, chapterId, requestId })
}

export function cancelAiRequest(requestId: string) {
  return invoke<boolean>('cancel_ai_request', { requestId })
}

export function aiChat(input: AiChatInput) {
  return invoke<AiChatResult>('ai_chat', { input })
}

export function loadAgentChatHistory(rootPath: string) {
  return invoke<ProjectFileDocument>('load_agent_chat_history', { rootPath })
}

export function saveAgentChatHistory(rootPath: string, content: string) {
  return invoke<ProjectFileDocument>('save_agent_chat_history', { rootPath, content })
}

export function reviewCandidateDraft(content: string) {
  return invoke<CandidateReviewIssue[]>('review_candidate_draft', { content })
}

export function reviewCandidateDraftForChapter(rootPath: string, chapterId: string, content: string) {
  return invoke<CandidateReviewIssue[]>('review_candidate_draft_for_chapter', { rootPath, chapterId, content })
}

export function recordCandidateAdoption(
  rootPath: string,
  chapterId: string,
  mode: 'replace' | 'append' | 'insert' | 'replace-paragraph' | 'undo-replace-paragraph',
  candidatePath: string,
  manuscriptPath: string,
) {
  return invoke<ProjectFileDocument>('record_candidate_adoption', {
    rootPath,
    chapterId,
    mode,
    candidatePath,
    manuscriptPath,
  })
}

export function exportManuscript(input: ExportInput) {
  return invoke<ProjectFileDocument>('export_manuscript', { input })
}

export type KnowledgeFileKind = 'confirmed-facts' | 'open-loops' | 'forbidden-rules'

export function loadKnowledgeFile(rootPath: string, kind: KnowledgeFileKind) {
  return invoke<ProjectFileDocument>('load_knowledge_file', { rootPath, kind })
}

export function saveKnowledgeFile(
  rootPath: string,
  kind: KnowledgeFileKind,
  content: string,
) {
  return invoke<ProjectFileDocument>('save_knowledge_file', { rootPath, kind, content })
}

export function adoptCandidateFactDraft(rootPath: string, draftPath: string) {
  return invoke<CandidateFactAdoptionResult>('adopt_candidate_fact_draft', { rootPath, draftPath })
}

export function loadAiProviders(rootPath: string) {
  return invoke<ProjectFileDocument>('load_ai_providers', { rootPath })
}

export function saveAiProviders(rootPath: string, content: string) {
  return invoke<ProjectFileDocument>('save_ai_providers', { rootPath, content })
}

export function testAiProvider(rootPath: string) {
  return invoke<ProviderTestResult>('test_ai_provider', { rootPath })
}

export function testAiProviders(rootPath: string) {
  return invoke<ProviderBatchTestResult>('test_ai_providers', { rootPath })
}

export function loadRecentProjects() {
  return invoke<RecentProject[]>('load_recent_projects')
}

export function rememberRecentProject(project: RecentProject) {
  return invoke<RecentProject[]>('remember_recent_project', { project })
}

export function openExternalUrl(url: string) {
  return invoke<void>('open_external_url', { url })
}

export function listFrameworkFiles(rootPath: string) {
  return invoke<FrameworkFileSummary[]>('list_framework_files', { rootPath })
}

export function loadFrameworkFile(rootPath: string, fileName: string) {
  return invoke<ProjectFileDocument>('load_framework_file', { rootPath, fileName })
}

export function saveFrameworkFile(rootPath: string, fileName: string, content: string) {
  return invoke<ProjectFileDocument>('save_framework_file', { rootPath, fileName, content })
}

export function generateFrameworkDraft(rootPath: string, fileName: string, authorInput: string) {
  return invoke<ProjectFileDocument>('generate_framework_draft', { rootPath, fileName, authorInput })
}

export function loadTimelineEvents(rootPath: string) {
  return invoke<ProjectFileDocument>('load_timeline_events', { rootPath })
}

export function saveTimelineEvents(rootPath: string, content: string) {
  return invoke<ProjectFileDocument>('save_timeline_events', { rootPath, content })
}

export function loadTimelineMilestones(rootPath: string) {
  return invoke<ProjectFileDocument>('load_timeline_milestones', { rootPath })
}

export function saveTimelineMilestones(rootPath: string, content: string) {
  return invoke<ProjectFileDocument>('save_timeline_milestones', { rootPath, content })
}

export function loadTimelineSettings(rootPath: string) {
  return invoke<TimelineSettings>('load_timeline_settings', { rootPath })
}

export function listProjectMarkdownFiles(rootPath: string) {
  return invoke<MarkdownFileSummary[]>('list_project_markdown_files', { rootPath })
}

export function listProjectVaultEntries(rootPath: string) {
  return invoke<ProjectVaultEntry[]>('list_project_vault_entries', { rootPath })
}

export function inspectProjectHealth(rootPath: string) {
  return invoke<ProjectHealthReport>('inspect_project_health', { rootPath })
}

export function repairProjectStructure(rootPath: string) {
  return invoke<ProjectHealthReport>('repair_project_structure', { rootPath })
}

export function revealProjectFolder(rootPath: string) {
  return invoke<ProjectFileDocument>('reveal_project_folder', { rootPath })
}

export function revealProjectPath(rootPath: string, relativePath: string) {
  return invoke<ProjectFileDocument>('reveal_project_path', { rootPath, relativePath })
}

export function importReferenceFile(rootPath: string, sourcePath: string) {
  return invoke<ProjectFileDocument>('import_reference_file', { rootPath, sourcePath })
}

export function importReferenceFileWithDeconstruction(rootPath: string, sourcePath: string) {
  return invoke<DeconstructionImportResult>('import_reference_file_with_deconstruction', { rootPath, sourcePath })
}

export function importReferenceDirectory(rootPath: string, sourcePath: string) {
  return invoke<ImportReferenceBatchResult>('import_reference_directory', { rootPath, sourcePath })
}

export function loadProjectMarkdownFile(rootPath: string, relativePath: string) {
  return invoke<ProjectFileDocument>('load_project_markdown_file', { rootPath, relativePath })
}

export function searchProjectTextFiles(rootPath: string, query: string) {
  return invoke<ProjectSearchResult[]>('search_project_text_files', { rootPath, query })
}

export function searchProjectTextFilesScoped(rootPath: string, query: string, scope: string) {
  return invoke<ProjectSearchResult[]>('search_project_text_files_scoped', { rootPath, query, scope })
}

export function pinSearchResultToWritingBrief(
  rootPath: string,
  chapterId: string,
  sourcePath: string,
  lineNumber: number,
  snippet: string,
) {
  return invoke<WritingBrief>('pin_search_result_to_writing_brief', {
    rootPath,
    chapterId,
    sourcePath,
    lineNumber,
    snippet,
  })
}

export function pinSearchResultsToWritingBrief(
  rootPath: string,
  chapterId: string,
  results: PinSearchResultInput[],
) {
  return invoke<WritingBrief>('pin_search_results_to_writing_brief', { rootPath, chapterId, results })
}

export function listPinnedContext(rootPath: string, chapterId: string) {
  return invoke<PinnedContextItem[]>('list_pinned_context', { rootPath, chapterId })
}

export function removePinnedContextItem(rootPath: string, chapterId: string, index: number) {
  return invoke<WritingBrief>('remove_pinned_context_item', { rootPath, chapterId, index })
}

export function saveModuleMarkdownFile(rootPath: string, relativePath: string, content: string) {
  return invoke<ProjectFileDocument>('save_module_markdown_file', { rootPath, relativePath, content })
}

export function extractCharacterCards(rootPath: string) {
  return invoke<ProjectFileDocument>('extract_character_cards', { rootPath })
}

export function rescanFacts(rootPath: string) {
  return invoke<ProjectFileDocument>('rescan_facts', { rootPath })
}

export function regenerateKnowledgeFile(rootPath: string, kind: KnowledgeFileKind, authorInput?: string) {
  return invoke<ProjectFileDocument>('regenerate_knowledge_file', { rootPath, kind, authorInput })
}

export function listSelectedSkills(rootPath: string) {
  return invoke<SkillFileSummary[]>('list_selected_skills', { rootPath })
}

export function importSkillFile(rootPath: string, sourcePath: string) {
  return invoke<SkillFileSummary>('import_skill_file', { rootPath, sourcePath })
}

export function setSkillDisabled(rootPath: string, fileName: string, disabled: boolean) {
  return invoke<SkillFileSummary[]>('set_skill_disabled', { rootPath, fileName, disabled })
}

export function setTemporarySkill(rootPath: string, fileName: string, temporary: boolean) {
  return invoke<SkillFileSummary[]>('set_temporary_skill', { rootPath, fileName, temporary })
}

export function analyzeSkillConflicts(rootPath: string) {
  return invoke<string[]>('analyze_skill_conflicts', { rootPath })
}

export function loadSkillFile(rootPath: string, fileName: string) {
  return invoke<ProjectFileDocument>('load_skill_file', { rootPath, fileName })
}

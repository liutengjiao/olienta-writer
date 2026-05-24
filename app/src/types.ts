export type ProjectSummary = {
  name: string
  root_path: string
  language: string
  chapter_count: number
}

export type CreateProjectInput = {
  name: string
  root_path: string
  language: string
  chapter_count: number
  target_words_per_chapter: number
  template: string
}

export type ChapterDocument = {
  chapter_id: string
  relative_path: string
  content: string
  word_count: number
}

export type ChapterSummary = {
  id: string
  title: string
  words: number
  state: string
}

export type VolumeInfo = {
  id: string
  title: string
  startChapter: number
  endChapter: number
  summary: string
}

export type ContractFulfillmentSummary = {
  chapterId: string
  contractPath: string
  manuscriptPath: string
  markdownPath: string
  jsonPath: string
  revisionPath: string
  requiredTotal: number
  fulfilledRequiredCount: number
  missingRequiredCount: number
  touchedForbiddenCount: number
  referencedFactCount: number
  score: number
  fulfilledRequired: string[]
  missingRequired: string[]
  touchedForbidden: string[]
  referencedFacts: string[]
}

export type ProjectFileDocument = {
  relative_path: string
  content: string
}

export type CandidateFactAdoptionResult = {
  draft_path: string
  confirmed_facts: ProjectFileDocument
  adopted_count: number
  skipped_count: number
  classified_paths: string[]
}

export type ImportedReferenceFile = {
  source_path: string
  relative_path: string
  bytes: number
}

export type ImportReferenceBatchResult = {
  imported_count: number
  skipped_count: number
  imported_files: ImportedReferenceFile[]
}

export type DeconstructionImportResult = {
  reference: ProjectFileDocument
  deconstruction_path: string
  skill_candidate_path: string
}

export type WritingBrief = {
  chapter_id: string
  relative_path: string
  content: string
}

export type CandidateDraft = {
  chapter_id: string
  relative_path: string
  writing_brief_path: string
  review_path: string
  fact_draft_path: string
  model_call_log_entry_id?: string
  content: string
  warnings: string[]
  review_issues: CandidateReviewIssue[]
}

export type AiChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AiChatContextItem = {
  label: string
  path: string
  content: string
}

export type AiChatInput = {
  rootPath: string
  chapterId?: string
  contextKind?: string
  activeView?: ViewKey
  requestId?: string
  clientContext?: AiChatContextItem[]
  messages: AiChatMessage[]
}

export type AiChatResult = {
  content: string
  provider: string
  model: string
  usedRemoteModel: boolean
  logEntryId?: string
  contextSnapshotPath?: string
  warnings?: string[]
}

export type CandidateReviewIssue = {
  severity: 'critical' | 'high' | 'medium' | 'low' | string
  category:
    | 'continuity'
    | 'setting'
    | 'character'
    | 'timeline'
    | 'ai_flavor'
    | 'logic'
    | 'pacing'
    | 'blueprint'
    | 'fact'
    | 'context'
    | 'generation'
    | 'other'
    | string
  location: string
  description: string
  evidence: string
  fix_hint: string
  blocking: boolean
}

export type ExportInput = {
  root_path: string
  format: 'markdown' | 'txt' | 'docx'
  scope?: 'all' | 'chapter' | 'selected'
  chapter_id?: string
  chapter_ids?: string[]
}

export type ProviderTestResult = {
  ok: boolean
  provider: string
  message: string
  logEntryId?: string
}

export type ProviderBatchTestResult = {
  total: number
  passed: number
  failed: number
  results: ProviderTestResult[]
}

export type RecentProject = {
  name: string
  root_path: string
}

export type FrameworkFileSummary = {
  id: string
  name: string
  relative_path: string
}

export type TimelineSettings = {
  enabled: boolean
  conflictCheck: boolean
  storage: string
}

export type MarkdownFileSummary = {
  category: string
  relative_path: string
  bytes: number
}

export type ProjectVaultEntry = {
  category: string
  relative_path: string
  bytes: number
  extension: string
  readable: boolean
}

export type ProjectHealthItem = {
  kind: string
  label: string
  relative_path: string
  status: string
  message: string
}

export type ProjectHealthReport = {
  status: string
  ready: boolean
  missing_count: number
  warning_count: number
  checks: ProjectHealthItem[]
}

export type ProjectSearchResult = {
  category: string
  relative_path: string
  line_number: number
  snippet: string
}

export type PinSearchResultInput = {
  source_path: string
  line_number: number
  snippet: string
}

export type PinnedContextItem = {
  index: number
  source_path: string
  line_number: number
  snippet: string
}

export type SkillFileSummary = {
  name: string
  relative_path: string
  bytes: number
  disabled: boolean
  temporary: boolean
  category: string
  conflict_tags: string[]
  scope: string
}

export type BlueprintHistorySummary = {
  name: string
  relative_path: string
  bytes: number
  backup_time_ms?: number
  candidate_path?: string
  writing_brief_path?: string
  revision_path?: string
  review_path?: string
  model_call_log_path?: string
  model_call_log_entry_id?: string
  adoption_status?: string
  adoption_mode?: string
  confirmation_path?: string
  confirmation_entry_id?: string
  restored_from_history_path?: string
  restored_from_confirmation_path?: string
  restored_from_confirmation_entry_id?: string
  restored_at_ms?: number
  manifest_path?: string
}

export type TaskStatus = 'ready' | 'working' | 'done' | 'error'

export type TaskItem = {
  id: string
  label: string
  status: TaskStatus
}

export type TaskLogItem = {
  id: string
  message: string
  status: TaskStatus
  time: string
}

export type ModuleKey =
  | 'home'
  | 'project-structure'
  | 'knowledge'
  | 'characters'
  | 'tasks'
  | 'logs'
  | 'model-calls'

export type ModuleSubViewKey =
  | 'home-entry'
  | 'home-recent'
  | 'knowledge-overview'
  | 'knowledge-facts'
  | 'knowledge-markdown'
  | 'knowledge-skills'
  | 'knowledge-search'
  | 'characters-overview'
  | 'characters-cards'
  | 'characters-relations'
  | 'characters-growth'
  | 'tasks-current'
  | 'tasks-history'
  | 'logs-author-confirmation'
  | 'logs-confirmations'
  | 'logs-system-events'
  | 'model-providers'
  | 'model-call-records'
  | 'model-tests'

export type ViewKey =
  | 'continue-writing'
  | 'novel-settings'
  | 'story-premise'
  | 'characters'
  | 'world'
  | 'plot-outline'
  | 'important-scenes'
  | 'timeline'
  | 'facts'
  | 'ai-providers'
  | 'exports'
  | 'local-files'
  | 'skills'
  | 'chapter-blueprint'
  | 'draft-box'
  | 'manuscript'

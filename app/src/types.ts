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

export type ProjectFileDocument = {
  relative_path: string
  content: string
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
  content: string
  warnings: string[]
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
}

export type BlueprintHistorySummary = {
  name: string
  relative_path: string
  bytes: number
}

export type TaskStatus = 'ready' | 'working' | 'done' | 'error'

export type TaskItem = {
  id: string
  label: string
  status: TaskStatus
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
  | 'logs-system-events'
  | 'model-providers'
  | 'model-call-records'
  | 'model-tests'

export type ViewKey =
  | 'novel-settings'
  | 'story-premise'
  | 'characters'
  | 'world'
  | 'plot-outline'
  | 'timeline'
  | 'facts'
  | 'ai-providers'
  | 'exports'
  | 'local-files'
  | 'skills'
  | 'chapter-blueprint'
  | 'draft-box'
  | 'manuscript'

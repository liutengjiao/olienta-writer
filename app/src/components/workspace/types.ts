import type {
  BlueprintHistorySummary,
  CandidateReviewIssue,
  ChapterSummary,
  CreateProjectInput,
  MarkdownFileSummary,
  ModuleKey,
  ModuleSubViewKey,
  PinnedContextItem,
  ProjectHealthReport,
  ProjectSearchResult,
  ProjectSummary,
  ProjectVaultEntry,
  ProviderBatchTestResult,
  ProviderTestResult,
  RecentProject,
  SkillFileSummary,
  TaskItem,
  TimelineSettings,
  VolumeInfo,
  ViewKey,
} from '../../types'
import type { Locale, TranslationKey } from '../../i18n'

type T = (locale: Locale, key: TranslationKey) => string

export type WorkspaceProps = {
  activeView: ViewKey
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  locale: Locale
  t: T
  focusMode: boolean
  project: ProjectSummary | null
  isProjectReadOnly: boolean
  recentProjects: RecentProject[]
  form: CreateProjectInput
  busy: boolean
  currentChapter: ChapterSummary
  chapters: ChapterSummary[]
  selectedChapterId: string
  chapterPath: string
  manuscript: string
  manuscriptSelection: { start: number; end: number } | null
  manuscriptRestoreSelection: { start: number; end: number } | null
  knowledgeRestoreSelection: {
    kind: 'confirmed-facts' | 'open-loops' | 'forbidden-rules'
    start: number
    end: number
  } | null
  recentParagraphReplacement: {
    candidatePreview: string
    manuscriptPreview: string
  } | null
  manuscriptWordCount: number
  saveState: string
  frameworkPath: string
  frameworkContent: string
  frameworkDraftContent: string
  frameworkDraftPath: string
  frameworkDraftSourceContent: string
  blueprintPath: string
  blueprint: string
  blueprintHistory: BlueprintHistorySummary[]
  selectedBlueprintHistoryPath: string
  blueprintHistoryPreview: string
  authorInputPath: string
  authorInput: string
  writingBrief: string
  writingBriefPath: string
  candidate: string
  candidatePath: string
  candidateReviewPath: string
  candidateWarnings: string[]
  candidateReviewIssues: CandidateReviewIssue[]
  candidateSelection: { start: number; end: number } | null
  candidateRestoreSelection: { start: number; end: number } | null
  candidateHistory: BlueprintHistorySummary[]
  selectedCandidateHistoryPath: string
  candidateHistoryPreview: string
  candidateHistoryJumpSource: {
    historyPath: string
    confirmationPath: string
    confirmationEntryId: string
  } | null
  candidateGenerationRunning: boolean
  candidateGenerationStatus: string
  confirmedFacts: string
  confirmedFactsPath: string
  openLoops: string
  openLoopsPath: string
  forbiddenRules: string
  forbiddenRulesPath: string
  timelineEvents: string
  timelineEventsPath: string
  timelineMilestones: string
  timelineMilestonesPath: string
  timelineSettings: TimelineSettings
  volumes: VolumeInfo[]
  markdownFiles: MarkdownFileSummary[]
  projectVaultEntries: ProjectVaultEntry[]
  projectHealth: ProjectHealthReport | null
  selectedMarkdownPath: string
  markdownPreview: string
  skillFiles: SkillFileSummary[]
  selectedSkillName: string
  skillPreview: string
  onChangeSkillPreview: (content: string) => void
  skillWarnings: string[]
  aiProvidersJson: string
  aiProvidersPath: string
  providerTestMessage: string
  highlightedModelCallId: string
  highlightedConfirmationPath: string
  highlightedConfirmationEntryId: string
  lastExportedPath: string
  tasks: TaskItem[]
  onImportProject: () => void
  onSelectView: (view: ViewKey) => void
  onUpdateForm: <Key extends keyof CreateProjectInput>(key: Key, value: CreateProjectInput[Key]) => void
  onChooseFolder: () => void
  onOpenProject: () => void
  onOpenRecentProject: (name: string, rootPath: string) => void
  onOpenExport: () => void
  onOpenSampleProject: () => void
  onCreateProject: () => void
  onSaveFrameworkFile: () => void
  onChangeFrameworkContent: (content: string) => void
  onGenerateFrameworkDraft: () => void
  onImportNovelStructureFile: () => void
  onLoadMarkdownFile: (relativePath: string) => void
  onLoadBlueprintHistory: (relativePath: string) => void
  onLoadCandidateHistory: (relativePath: string) => void
  onChangeConfirmedFacts: (content: string) => void
  onChangeOpenLoops: (content: string) => void
  onChangeForbiddenRules: (content: string) => void
  onChangeTimelineEvents: (content: string) => void
  onSaveTimelineEvents: () => void
  onChangeTimelineMilestones: (content: string) => void
  onSaveTimelineMilestones: () => void
  onChangeVolumes: (volumes: VolumeInfo[]) => void
  onSaveVolumes: (volumes?: VolumeInfo[]) => void
  onSaveKnowledgeFile: (kind: 'confirmed-facts' | 'open-loops' | 'forbidden-rules') => void
  onRepairProjectStructure: () => void
  onRevealProjectFolder: () => void
  onRevealProjectPath: (relativePath: string) => void
  onImportReferenceFile: () => void
  onImportReferenceFolder: () => void
  onPinSearchResultToBrief: (result: ProjectSearchResult) => void
  onPinSearchResultsToBrief: (results: ProjectSearchResult[]) => void
  onListPinnedContext: () => Promise<PinnedContextItem[]>
  onRemovePinnedContextItem: (index: number) => Promise<void>
  onChangeMarkdownPreview: (content: string) => void
  onSaveModuleMarkdownFile: (relativePath: string, content: string) => void
  onSelectChapter: (chapterId: string) => void
  onChangeManuscript: (content: string) => void
  onSaveChapter: () => void
  onImportChapterMarkdown: () => void
  onChangeBlueprint: (content: string) => void
  onSaveBlueprint: () => void
  onGenerateBlueprintDraft: () => void
  onGenerateBlueprintFromManuscript: () => void
  onImportBlueprintBundle: () => void
  onRegenerateAllBlueprints: () => void
  onRegenerateFollowingBlueprints: () => void
  onSaveAuthorInput: () => void
  onChangeAuthorInput: (content: string) => void
  onComposeBrief: () => void
  onChangeWritingBrief: (content: string) => void
  onGenerateCandidate: () => void
  onCancelCandidateGeneration: () => void
  onChangeCandidate: (content: string) => void
  onChangeCandidateSelection: (start: number, end: number) => void
  onSaveCandidate: () => void
  onClearCandidate: () => void
  onAdoptCandidate: (mode?: 'replace' | 'append' | 'insert') => void
  onAdoptCandidateText: (content: string, mode?: 'append' | 'insert') => void
  onReplaceManuscriptParagraph: (candidateParagraph: string, manuscriptParagraph: string) => void
  onUndoParagraphReplacement: () => void
  onOpenKnowledgeHit: (kind: 'fact' | 'loop' | 'rule', text: string) => void
  onLocateCandidateText: (content: string) => void
  onLocateManuscriptText: (content: string) => void
  onChangeManuscriptSelection: (start: number, end: number) => void
  onRestoreCandidateHistory: () => void
  onOpenCandidateHistoryVersion: (manifestPath: string, confirmationPath?: string, confirmationEntryId?: string) => void
  onChangeAiProvidersJson: (content: string) => void
  onSaveAiProviders: () => Promise<boolean>
  onTestAiProvider: () => Promise<ProviderTestResult | null | void>
  onTestAiProviders: () => Promise<ProviderBatchTestResult | null | void>
  onOpenModelProviders: () => void
  onOpenModelCallRecord: (logEntryId: string) => void
  onClearModelCallHighlight: () => void
  onOpenConfirmationRecord: (confirmationPath: string, confirmationEntryId?: string) => void
  onClearConfirmationHighlight: () => void
  onLoadSkillFile: (fileName: string) => void
  onImportSkillFile: () => void
  onSetSkillDisabled: (fileName: string, disabled: boolean) => void
  onSetTemporarySkill: (fileName: string, temporary: boolean) => void
  onExtractCharacterCards: () => void
  onRescanFacts: (kind?: 'confirmed-facts' | 'open-loops' | 'forbidden-rules', authorInput?: string) => void
  onImportSkillFolder: () => void
  onToggleFocusMode: () => void
  onExportProject: (format: 'markdown' | 'txt' | 'docx', scope?: 'all' | 'chapter' | 'selected', chapterIds?: string[]) => void
}

export const MODULE_TITLES: Record<string, string> = {
  home: '首页',
  'project-structure': '项目结构',
  knowledge: '知识库',
  characters: '角色',
  tasks: '任务',
  logs: '日志',
  'model-calls': '模型调用',
}

export const VIEW_TITLES: Record<string, string> = {
  'continue-writing': '继续写',
  'novel-settings': '小说结构',
  'story-premise': '故事梗概',
  characters: '角色图谱',
  world: '世界观',
  'plot-outline': '情节大纲',
  'important-scenes': '重要场景',
  timeline: '时间线与里程碑',
  'chapter-blueprint': '章节蓝图',
  'draft-box': '正文草稿',
  manuscript: '正文',
  facts: '事实库',
  skills: 'Skills',
  'ai-providers': 'AI Provider',
  exports: '导出',
  'local-files': '资料库',
}

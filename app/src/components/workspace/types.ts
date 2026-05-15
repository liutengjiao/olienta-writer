import type {
  BlueprintHistorySummary,
  CreateProjectInput,
  MarkdownFileSummary,
  ModuleKey,
  ModuleSubViewKey,
  PinnedContextItem,
  ProjectHealthReport,
  ProjectSearchResult,
  ProjectSummary,
  ProjectVaultEntry,
  SkillFileSummary,
  TaskItem,
  ViewKey,
} from '../../types'

export type WorkspaceProps = {
  [key: string]: unknown
  activeView: ViewKey
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  focusMode: boolean
  project: ProjectSummary | null
  recentProjects: unknown[]
  form: CreateProjectInput
  busy: boolean
  currentChapter: { id: string; title: string; word_count?: number; state?: string }
  chapters: Array<{ id: string; title: string; word_count?: number; state?: string }>
  selectedChapterId: string
  chapterPath: string
  manuscript: string
  manuscriptWordCount: number
  saveState: string
  frameworkPath: string
  frameworkContent: string
  blueprintPath: string
  blueprint: string
  authorInput: string
  writingBrief: string
  writingBriefPath: string
  candidate: string
  candidatePath: string
  candidateReviewPath: string
  candidateWarnings: string[]
  candidateHistory: BlueprintHistorySummary[]
  selectedCandidateHistoryPath: string
  candidateHistoryPreview: string
  confirmedFacts: string
  confirmedFactsPath: string
  openLoops: string
  openLoopsPath: string
  markdownFiles: MarkdownFileSummary[]
  projectVaultEntries: ProjectVaultEntry[]
  projectHealth: ProjectHealthReport | null
  selectedMarkdownPath: string
  markdownPreview: string
  skillFiles: SkillFileSummary[]
  selectedSkillName: string
  skillPreview: string
  skillWarnings: string[]
  aiProvidersJson: string
  aiProvidersPath: string
  providerTestMessage: string
  lastExportedPath: string
  tasks: TaskItem[]
  onUpdateForm: <Key extends keyof CreateProjectInput>(key: Key, value: CreateProjectInput[Key]) => void
  onChooseFolder: () => void
  onOpenProject: () => void
  onOpenRecentProject: (name: string, rootPath: string) => void
  onOpenExport: () => void
  onOpenSampleProject: () => void
  onCreateProject: () => void
  onLoadMarkdownFile: (relativePath: string) => void
  onLoadBlueprintHistory: (relativePath: string) => void
  onLoadCandidateHistory: (relativePath: string) => void
  onChangeConfirmedFacts: (content: string) => void
  onChangeOpenLoops: (content: string) => void
  onSaveKnowledgeFile: (kind: 'confirmed-facts' | 'open-loops') => void
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
  onChangeBlueprint: (content: string) => void
  onSaveBlueprint: () => void
  onGenerateBlueprintDraft: () => void
  onComposeBrief: () => void
  onChangeWritingBrief: (content: string) => void
  onGenerateCandidate: () => void
  onChangeCandidate: (content: string) => void
  onSaveCandidate: () => void
  onClearCandidate: () => void
  onAdoptCandidate: (mode?: 'replace' | 'append') => void
  onRestoreCandidateHistory: () => void
  onChangeAiProvidersJson: (content: string) => void
  onSaveAiProviders: () => void
  onTestAiProvider: () => void
  onLoadSkillFile: (fileName: string) => void
  onImportSkillFile: () => void
  onSetSkillDisabled: (fileName: string, disabled: boolean) => void
  onSetTemporarySkill: (fileName: string, temporary: boolean) => void
  onExtractCharacterCards: () => void
  onRescanFacts: () => void
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
  'novel-settings': '小说设置',
  'story-premise': '故事前提',
  characters: '角色图谱',
  world: '世界观',
  'plot-outline': '情节大纲',
  timeline: '时间线与里程碑',
  'chapter-blueprint': '章节蓝图',
  'draft-box': '候选稿',
  manuscript: '正文',
  facts: '事实库',
  skills: 'Skills',
  'ai-providers': 'AI Provider',
  exports: '导出',
  'local-files': '本地 Markdown',
}

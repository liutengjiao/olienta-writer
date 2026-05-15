import {
  ChapterList,
  DraftPanel,
  FocusMode,
  ManuscriptPanel,
  MarkdownDocument,
} from './workspace/EditorPanels'
import {
  ExportPanel,
  LocalFilesPanel,
  LogsPanel,
  ModelCallsPanel,
  SkillPanel,
  TasksPanel,
} from './workspace/DocumentPanels'
import {
  CharactersPanel,
  KnowledgeFactsPanel,
  KnowledgePanel,
} from './workspace/KnowledgePanels'
import type {
  CreateProjectInput,
  BlueprintHistorySummary,
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
} from '../types'

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

type Props = WorkspaceProps

const MODULE_TITLES: Record<string, string> = {
  home: '首页',
  'project-structure': '项目结构',
  knowledge: '知识库',
  characters: '角色',
  tasks: '任务',
  logs: '日志',
  'model-calls': '模型调用',
}

const VIEW_TITLES: Record<string, string> = {
  'novel-settings': '小说设置',
  'story-premise': '故事前提',
  characters: '角色图谱',
  world: '世界观',
  'plot-outline': '情节大纲',
  timeline: '时间线及里程碑',
  'chapter-blueprint': '章节蓝图',
  'draft-box': '草稿箱',
  manuscript: '正文',
  facts: '事实库',
  skills: 'Skills',
  'ai-providers': 'AI Provider',
  exports: '导出',
  'local-files': '本地 Markdown',
}

const FRAMEWORK_PATHS: Record<string, string> = {
  'story-premise': 'framework/02-premise.md',
  characters: 'framework/03-characters.md',
  world: 'framework/05-world.md',
  'plot-outline': 'framework/04-plot-outline.md',
  timeline: 'timeline/events.md',
}

export function Workspace(props: Props) {
  if (props.focusMode) return <FocusMode {...props} />

  const title = VIEW_TITLES[props.activeView] ?? MODULE_TITLES[props.activeModule] ?? 'Olienta'
  const subtitle = props.project
    ? props.project.root_path
    : '本地优先写作工作台。打开或创建项目后，直接编辑本地 Markdown 文件。'

  return (
    <section className="workspace" aria-label="Olienta workspace">
      <div className="top-tabs">
        <div className="top-tab active">{title}</div>
      </div>
      <div className="workspace-scroll">
        <PageFrame title={title} subtitle={subtitle}>
          <RouteContent {...props} />
        </PageFrame>
      </div>
    </section>
  )
}

function RouteContent(props: Props) {
  if (props.activeModule === 'home') return <HomePanel {...props} />
  if (props.activeView === 'novel-settings') return <NovelSettingsPanel {...props} />
  if (props.activeView === 'chapter-blueprint') return <BlueprintPanel {...props} />
  if (props.activeView === 'draft-box') return <DraftPanel {...props} />
  if (props.activeView === 'manuscript') return <ManuscriptPanel {...props} />
  if (props.activeView === 'facts') return <KnowledgeFactsPanel {...props} />
  if (props.activeView === 'skills') return <SkillPanel {...props} />
  if (props.activeView === 'local-files') return <LocalFilesPanel {...props} />
  if (props.activeView === 'ai-providers' || props.activeModule === 'model-calls') return <ModelCallsPanel {...props} />
  if (props.activeModule === 'characters') return <CharactersPanel {...props} />
  if (props.activeModule === 'knowledge') return <KnowledgePanel {...props} />
  if (props.activeModule === 'tasks') return <TasksPanel {...props} />
  if (props.activeModule === 'logs') return <LogsPanel {...props} />
  if (props.activeView === 'exports') return <ExportPanel {...props} />
  return <FrameworkPanel {...props} />
}

function PageFrame(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <h1>{props.title}</h1>
          {props.subtitle && <p>{props.subtitle}</p>}
        </div>
        <button type="button" className="ghost-button assistant-page-button" onClick={openAgent}>打开助手</button>
      </div>
      {props.children}
    </section>
  )
}

function HomePanel(props: Props) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>项目入口</h2></div>
      <div className="settings-grid">
        <label>项目名称<input value={props.form.name} onChange={(event) => props.onUpdateForm('name', event.target.value)} /></label>
        <label>项目文件夹<input value={props.form.root_path} onChange={(event) => props.onUpdateForm('root_path', event.target.value)} /></label>
        <label>语言<input value={props.form.language} onChange={(event) => props.onUpdateForm('language', event.target.value)} /></label>
        <label>章节数<input type="number" value={props.form.chapter_count} onChange={(event) => props.onUpdateForm('chapter_count', Number(event.target.value))} /></label>
      </div>
      <div className="editor-actions">
        <button className="ghost-button" onClick={props.onChooseFolder}>选择文件夹</button>
        <button className="ghost-button" onClick={props.onOpenProject}>打开项目</button>
        <button className="ghost-button" onClick={props.onOpenSampleProject}>打开样例</button>
        <button className="primary-button" onClick={props.onCreateProject} disabled={props.busy}>创建项目</button>
      </div>
    </section>
  )
}

function NovelSettingsPanel(props: Props) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>小说设置</h2></div>
      <HomePanel {...props} />
    </section>
  )
}

function FrameworkPanel(props: Props) {
  const path = FRAMEWORK_PATHS[props.activeView] ?? props.frameworkPath
  return <MarkdownDocument title={VIEW_TITLES[props.activeView] ?? '框架文件'} path={path} value={props.frameworkContent || props.markdownPreview} onChange={props.onChangeMarkdownPreview} onSave={() => props.onSaveModuleMarkdownFile(path, props.markdownPreview || props.frameworkContent)} />
}

function BlueprintPanel(props: Props) {
  return (
    <section className="split-editor-layout">
      <ChapterList {...props} />
      <MarkdownDocument title="章节蓝图" path={props.blueprintPath} value={props.blueprint} onChange={props.onChangeBlueprint} onSave={props.onSaveBlueprint} actions={<><button className="ghost-button" onClick={props.onGenerateBlueprintDraft}>生成草案</button><button className="ghost-button" onClick={props.onComposeBrief}>装配任务书</button></>} />
    </section>
  )
}

function openAgent() {
  window.dispatchEvent(new CustomEvent('olienta:open-agent'))
}

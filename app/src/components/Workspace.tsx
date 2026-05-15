import { useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
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

function KnowledgePanel(props: Props) {
  if (props.activeModuleView === 'knowledge-facts') return <KnowledgeFactsPanel {...props} />
  if (props.activeModuleView === 'knowledge-skills') return <SkillPanel {...props} />
  if (props.activeModuleView === 'knowledge-markdown') return <LocalFilesPanel {...props} />

  const markdownCount = props.markdownFiles.length
  const referenceCount = props.projectVaultEntries.filter((entry) =>
    entry.relative_path.startsWith('knowledge/'),
  ).length
  const healthStatus = props.projectHealth?.status ?? 'not opened'

  return (
    <section className="knowledge-overview-panel">
      <div className="knowledge-summary-grid">
        <article>
          <span>项目健康</span>
          <strong>{healthStatus}</strong>
          <p>{props.projectHealth ? `缺失 ${props.projectHealth.missing_count} 项，警告 ${props.projectHealth.warning_count} 项` : '打开项目后检查本地结构。'}</p>
        </article>
        <article>
          <span>Markdown 文件</span>
          <strong>{markdownCount}</strong>
          <p>无需数据库即可检查的本地项目文件。</p>
        </article>
        <article>
          <span>知识库文件</span>
          <strong>{referenceCount}</strong>
          <p>导入资料、索引、检索文档和事实文件。</p>
        </article>
      </div>

      <div className="knowledge-import-actions editor-card">
        <div>
          <h2>本地资料导入</h2>
          <p className="empty-note">把 Markdown/TXT 资料导入项目文件夹，再把有用片段钉选进章节任务书。</p>
        </div>
        <div className="editor-actions">
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFile}>导入文件</button>
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFolder}>导入文件夹</button>
          <button type="button" className="ghost-button" onClick={props.onRevealProjectFolder}>打开文件夹</button>
          <button type="button" className="primary-button" onClick={props.onRepairProjectStructure}>修复结构</button>
        </div>
      </div>

      {props.activeModuleView === 'knowledge-search' ? (
        <KnowledgeSearchPanel {...props} />
      ) : (
        <ProjectHealthPanel {...props} />
      )}
    </section>
  )
}

function KnowledgeFactsPanel(props: Props) {
  return (
    <section className="module-document-layout">
      <MarkdownDocument
        title="已确认事实"
        path={props.confirmedFactsPath}
        value={props.confirmedFacts}
        onChange={props.onChangeConfirmedFacts}
        onSave={() => props.onSaveKnowledgeFile('confirmed-facts')}
        actions={<button type="button" className="ghost-button" onClick={props.onRescanFacts}>重扫正文</button>}
      />
      <MarkdownDocument
        title="未闭合伏笔"
        path={props.openLoopsPath}
        value={props.openLoops}
        onChange={props.onChangeOpenLoops}
        onSave={() => props.onSaveKnowledgeFile('open-loops')}
      />
    </section>
  )
}

const SEARCH_SCOPES = [
  { key: 'all', title: '全部', detail: '所有可读项目文本' },
  { key: 'imported', title: '导入资料', detail: 'knowledge/markdown/imported' },
  { key: 'framework', title: '框架', detail: '设定、前提、情节、世界观' },
  { key: 'manuscript', title: '正文链路', detail: '正文、蓝图、候选稿' },
  { key: 'memory', title: '记忆', detail: '事实、任务、日志' },
]

function KnowledgeSearchPanel(props: Props) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [results, setResults] = useState<ProjectSearchResult[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [pinnedContext, setPinnedContext] = useState<PinnedContextItem[]>([])
  const [status, setStatus] = useState('就绪')

  async function runSearch() {
    const trimmed = query.trim()
    if (!trimmed) {
      setStatus('请输入检索关键词。')
      setResults([])
      setSelectedKeys([])
      return
    }

    if (!props.project) {
      const previewResults = props.markdownFiles
        .filter((file) => file.relative_path.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 20)
        .map((file, index) => ({
          category: file.category,
          relative_path: file.relative_path,
          line_number: index + 1,
          snippet: `预览匹配：“${trimmed}” 出现在 ${file.relative_path}`,
        }))
      setResults(previewResults)
      setSelectedKeys([])
      setStatus(`预览匹配 ${previewResults.length} 条`)
      return
    }

    setStatus('检索中...')
    try {
      const found = isTauriRuntime
        ? await tauriApi.searchProjectTextFilesScoped(props.project.root_path, trimmed, scope)
        : []
      setResults(found)
      setSelectedKeys([])
      setStatus(`匹配 ${found.length} 条`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshPinnedContext() {
    setStatus('正在读取钉选材料...')
    const pinned = await props.onListPinnedContext()
    setPinnedContext(pinned)
    setStatus(`已钉选 ${pinned.length} 条`)
  }

  function toggleResult(result: ProjectSearchResult) {
    const key = searchResultKey(result)
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
  }

  const selectedResults = results.filter((result) => selectedKeys.includes(searchResultKey(result)))

  return (
    <section className="editor-card">
      <div className="card-heading">
        <div>
          <h2>本地全文检索</h2>
          <p>检索本地项目文件，并把有用材料钉选进当前章节任务书。</p>
        </div>
        <span className="status-pill">{status}</span>
      </div>

      <div className="search-strip">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch()
          }}
          placeholder="检索项目文本文件"
        />
        <button type="button" className="primary-button" onClick={() => void runSearch()}>检索</button>
        <button type="button" className="ghost-button" onClick={() => void refreshPinnedContext()}>钉选材料</button>
      </div>

      <div className="search-scope-grid">
        {SEARCH_SCOPES.map((item) => (
          <button
            type="button"
            className={scope === item.key ? 'active' : ''}
            key={item.key}
            onClick={() => setScope(item.key)}
          >
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>

      <div className="search-results">
        {results.length > 0 && (
          <div className="search-bulk-actions">
            <label>
              <input
                type="checkbox"
                checked={selectedKeys.length === results.length}
                onChange={(event) =>
                  setSelectedKeys(event.target.checked ? results.map(searchResultKey) : [])
                }
              />
              <span>已选择 {selectedKeys.length} 条</span>
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={selectedResults.length === 0}
              onClick={() => props.onPinSearchResultsToBrief(selectedResults)}
            >
              批量钉选
            </button>
          </div>
        )}
        {results.map((result) => (
          <article className="search-result-row" key={searchResultKey(result)}>
            <label className="search-result-select">
              <input
                type="checkbox"
                checked={selectedKeys.includes(searchResultKey(result))}
                onChange={() => toggleResult(result)}
              />
              <span>{result.relative_path}:{result.line_number}</span>
            </label>
            <strong>{result.snippet}</strong>
            <div className="search-result-actions">
              <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(result.relative_path)}>
                打开
              </button>
              <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(result.relative_path)}>
                定位
              </button>
              <button type="button" className="primary-button" onClick={() => props.onPinSearchResultToBrief(result)}>
                钉选
              </button>
            </div>
          </article>
        ))}
      </div>

      {pinnedContext.length > 0 && (
        <section className="pinned-context-panel">
          <div className="panel-heading">
            <h2>已钉选材料</h2>
            <span>第 {props.selectedChapterId} 章，共 {pinnedContext.length} 条</span>
          </div>
          <div className="pinned-context-list">
            {pinnedContext.map((item) => (
              <article className="pinned-context-item" key={`${item.index}-${item.source_path}`}>
                <span>{item.source_path}:{item.line_number}</span>
                <p>{item.snippet}</p>
                <div className="search-result-actions">
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => {
                      void props.onRemovePinnedContextItem(item.index).then(refreshPinnedContext)
                    }}
                  >
                    移除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

function searchResultKey(result: ProjectSearchResult) {
  return `${result.relative_path}:${result.line_number}:${result.snippet}`
}

function ProjectHealthPanel(props: Props) {
  const report = props.projectHealth
  const checks = report?.checks ?? []
  return (
    <section className={`project-health-panel ${report?.ready ? 'ready' : report ? 'warning' : 'missing'}`}>
      <div className="panel-heading">
        <div>
          <h2>项目结构健康</h2>
          <p className="empty-note">{report ? '当前写作项目所需的本地文件和文件夹。' : '打开项目后检查本地文件结构。'}</p>
        </div>
        <div className="health-side-actions">
          <button type="button" className="ghost-button" onClick={props.onRevealProjectFolder}>打开文件夹</button>
          <button type="button" className="primary-button" onClick={props.onRepairProjectStructure}>修复</button>
        </div>
      </div>
      <div className="health-strip">
        <article><span>状态</span><strong>{report?.status ?? '未打开项目'}</strong></article>
        <article><span>缺失</span><strong>{report?.missing_count ?? 0}</strong></article>
        <article><span>警告</span><strong>{report?.warning_count ?? 0}</strong></article>
      </div>
      <div className="health-missing-list">
        {checks.slice(0, 10).map((check) => (
          <button
            type="button"
            className={`health-missing-row ${check.kind}`}
            key={`${check.kind}-${check.relative_path}`}
            onClick={() => props.onRevealProjectPath(check.relative_path)}
          >
            <strong>{check.status}</strong>
            <span>{check.relative_path}</span>
            <p>{check.message || check.label}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

const CHARACTER_DOCUMENTS: Record<string, { title: string; path: string; note: string }> = {
  'characters-overview': {
    title: 'Character Overview',
    path: 'framework/03-characters.md',
    note: 'Source character map. Use this as the author-controlled source before extracting cards.',
  },
  'characters-cards': {
    title: 'Character Cards',
    path: 'characters/cards/INDEX.md',
    note: '生成索引和独立角色卡，保存在 characters/cards 下。',
  },
  'characters-relations': {
    title: 'Relationship Map',
    path: 'characters/relations.md',
    note: '从角色材料中整理关系、欲望、利益和冲突。',
  },
  'characters-growth': {
    title: 'Growth Line',
    path: 'characters/growth.md',
    note: '记录角色状态变化和对应章节位置。',
  },
}

function CharactersPanel(props: Props) {
  const current = CHARACTER_DOCUMENTS[props.activeModuleView] ?? CHARACTER_DOCUMENTS['characters-overview']
  const characterFiles = props.markdownFiles.filter((file) =>
    file.relative_path === 'framework/03-characters.md' ||
    file.relative_path.startsWith('characters/'),
  )
  const cardFiles = characterFiles.filter((file) =>
    file.relative_path.startsWith('characters/cards/') && !file.relative_path.endsWith('/README.md'),
  )
  const selectedPath = props.selectedMarkdownPath || current.path
  const selectedContent = props.markdownPreview || ''

  return (
    <section className="character-workspace">
      <div className="character-profile-summary">
        <div>
          <span>Character module</span>
          <strong>{current.title}</strong>
          <small>{current.note}</small>
        </div>
        <dl>
          <div>
            <dt>Card files</dt>
            <dd>{cardFiles.length}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>framework/03-characters.md</dd>
          </div>
          <div>
            <dt>Relations</dt>
            <dd>{hasMarkdownFile(props.markdownFiles, 'characters/relations.md') ? '已就绪' : '缺失'}</dd>
          </div>
          <div>
            <dt>Growth</dt>
            <dd>{hasMarkdownFile(props.markdownFiles, 'characters/growth.md') ? '已就绪' : '缺失'}</dd>
          </div>
        </dl>
      </div>

      <section className="character-workspace-layout">
        <aside className="character-card-list">
          <button type="button" className="primary-button" onClick={props.onExtractCharacterCards}>
            抽取角色卡
          </button>
          {Object.values(CHARACTER_DOCUMENTS).map((document) => (
            <button
              type="button"
              className={`local-file-row ${selectedPath === document.path ? 'active' : ''}`}
              key={document.path}
              onClick={() => props.onLoadMarkdownFile(document.path)}
            >
              <strong>{document.title}</strong>
              <span>{document.path}</span>
            </button>
          ))}
          {cardFiles.map((file) => (
            <button
              type="button"
              className={`local-file-row ${selectedPath === file.relative_path ? 'active' : ''}`}
              key={file.relative_path}
              onClick={() => props.onLoadMarkdownFile(file.relative_path)}
            >
              <strong>{file.relative_path.replace(/^characters\/cards\//, '')}</strong>
              <span>{formatBytes(file.bytes)}</span>
            </button>
          ))}
        </aside>

        <div className="character-card-detail">
          <MarkdownDocument
            title={selectedPath === current.path ? current.title : 'Character File'}
            path={selectedPath}
            value={selectedContent}
            onChange={props.onChangeMarkdownPreview}
            onSave={() => selectedPath && props.onSaveModuleMarkdownFile(selectedPath, selectedContent)}
          />
        </div>
      </section>
    </section>
  )
}

function hasMarkdownFile(files: MarkdownFileSummary[], relativePath: string) {
  return files.some((file) => file.relative_path === relativePath)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

function openAgent() {
  window.dispatchEvent(new CustomEvent('olienta:open-agent'))
}

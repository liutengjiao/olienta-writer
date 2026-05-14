import { useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
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

type Props = {
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

function DraftPanel(props: Props) {
  const candidateUnits = estimateTextUnits(props.candidate)
  const manuscriptUnits = estimateTextUnits(props.manuscript)
  const candidateParagraphs = countParagraphs(props.candidate)
  const manuscriptParagraphs = countParagraphs(props.manuscript)

  return (
    <section className="draft-workspace">
      <div className="draft-main">
        <section className="chapter-chain">
          <div className="chapter-chain-heading">
            <div>
              <h2>候选稿审查流程</h2>
              <p>AI 输出只停留在候选稿中，必须由作者明确采用后才进入正文。</p>
            </div>
            <span>{props.currentChapter.title}</span>
          </div>
          <div className="chapter-chain-steps">
            <article className="chapter-chain-step confirmed">
              <div><strong>任务书</strong><span>{props.writingBriefPath}</span></div>
              <p>由蓝图、作者输入、事实库、Skill 和钉选材料装配而成。</p>
            </article>
            <article className="chapter-chain-step active">
              <div><strong>候选稿</strong><span>{props.candidatePath}</span></div>
              <p>候选稿可编辑、审查和保存，但不会自动影响已确认正文。</p>
            </article>
            <article className="chapter-chain-step draft">
              <div><strong>正文</strong><span>{props.selectedChapterId}</span></div>
              <p>只有替换或追加才会把候选稿写入已确认章节。</p>
            </article>
          </div>
        </section>

        <MarkdownDocument
          title="候选稿"
          path={props.candidatePath}
          value={props.candidate}
          onChange={props.onChangeCandidate}
          onSave={props.onSaveCandidate}
          actions={
            <>
              <button className="ghost-button" onClick={props.onComposeBrief}>装配任务书</button>
              <button className="ghost-button" onClick={props.onGenerateCandidate}>生成</button>
              <button className="ghost-button" onClick={props.onClearCandidate}>清空</button>
              <button className="ghost-button" onClick={() => props.onAdoptCandidate('append')}>追加</button>
              <button className="primary-button" onClick={() => props.onAdoptCandidate('replace')}>替换</button>
            </>
          }
        />

        <section className="draft-diff-card">
          <div className="card-heading">
            <div>
              <h2>候选稿与正文对比</h2>
              <p>采用前的轻量审查统计。</p>
            </div>
            <span className="status-pill">{props.candidateReviewPath}</span>
          </div>
          <div className="health-strip">
            <article><span>候选稿单位数</span><strong>{candidateUnits}</strong></article>
            <article><span>正文单位数</span><strong>{manuscriptUnits}</strong></article>
            <article><span>段落差值</span><strong>{candidateParagraphs - manuscriptParagraphs}</strong></article>
          </div>
        </section>

        {props.candidateWarnings.length > 0 && (
          <section className="warning-list">
            <div className="card-heading">
              <h2>审查提醒</h2>
              <span>{props.candidateWarnings.length}</span>
            </div>
            <ul>
              {props.candidateWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </section>
        )}
      </div>

      <aside className="blueprint-history">
        <div className="panel-heading">
          <h2>历史版本</h2>
          <span>{props.candidateHistory.length}</span>
        </div>
        <div className="compact-list">
          {props.candidateHistory.length === 0 && <p className="empty-note">还没有保存过候选稿历史。</p>}
          {props.candidateHistory.map((item) => (
            <button
              type="button"
              className={`compact-row ${item.relative_path === props.selectedCandidateHistoryPath ? 'active' : ''}`}
              key={item.relative_path}
              onClick={() => props.onLoadCandidateHistory(item.relative_path)}
            >
              <strong>{item.name}</strong>
              <span>{item.relative_path}</span>
              <small>{formatBytes(item.bytes)}</small>
            </button>
          ))}
        </div>
        <textarea
          className="history-preview"
          readOnly
          value={props.candidateHistoryPreview || '选择一个已保存的候选稿版本进行预览。'}
        />
        <button
          type="button"
          className="primary-button"
          disabled={!props.selectedCandidateHistoryPath}
          onClick={props.onRestoreCandidateHistory}
        >
          恢复到编辑器
        </button>
      </aside>
    </section>
  )
}

function ManuscriptPanel(props: Props) {
  const paragraphCount = countParagraphs(props.manuscript)
  const candidateUnits = estimateTextUnits(props.candidate)

  return (
    <section className="confirmation-grid">
      <div className="confirmation-main">
        <section className="chapter-chain">
          <div className="chapter-chain-heading">
            <div>
              <h2>已确认正文</h2>
              <p>保存本章会记录作者确认，并刷新后续记忆链路。</p>
            </div>
            <span>{props.saveState}</span>
          </div>
          <div className="chapter-chain-steps">
            <article className="chapter-chain-step confirmed">
              <div><strong>章节文件</strong><span>{props.chapterPath}</span></div>
              <p>普通 Markdown 文件仍是已确认正文的真实来源。</p>
            </article>
            <article className="chapter-chain-step draft">
              <div><strong>候选稿可用</strong><span>{candidateUnits}</span></div>
              <p>候选稿只能从草稿箱追加或替换，不会静默进入正文。</p>
            </article>
            <article className="chapter-chain-step active">
              <div><strong>事实库</strong><span>{props.confirmedFactsPath}</span></div>
              <p>大幅编辑后可重扫事实库，从已保存正文刷新确认事实。</p>
            </article>
          </div>
        </section>

        <MarkdownDocument
          title="正文"
          path={props.chapterPath}
          value={props.manuscript}
          onChange={props.onChangeManuscript}
          onSave={props.onSaveChapter}
          actions={
            <>
              <button type="button" className="ghost-button" onClick={props.onToggleFocusMode}>纯写作</button>
              <button type="button" className="ghost-button" onClick={props.onRescanFacts}>重扫事实</button>
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('markdown', 'chapter')}>导出 MD</button>
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('txt', 'chapter')}>导出 TXT</button>
            </>
          }
        />
      </div>

      <aside className="confirmation-side">
        <section className="review-card">
          <div className="panel-heading">
            <h2>章节状态</h2>
            <span>{props.currentChapter.state ?? 'draft'}</span>
          </div>
          <div className="health-strip">
            <article><span>Words</span><strong>{props.manuscriptWordCount}</strong></article>
            <article><span>Units</span><strong>{estimateTextUnits(props.manuscript)}</strong></article>
            <article><span>Paragraphs</span><strong>{paragraphCount}</strong></article>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>作者确认</h2>
            <span>本地日志</span>
          </div>
          <p className="empty-note">保存会写入确认摘要和事件记录；除非明确采用候选稿，否则 AI 文本不会进入正文。</p>
          <div className="editor-actions">
            <button type="button" className="primary-button" onClick={props.onSaveChapter}>保存已确认正文</button>
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile('facts/author-confirmation.md')}>打开日志</button>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>Memory</h2>
            <span>{props.openLoopsPath}</span>
          </div>
          <p className="empty-note">事实和伏笔都存为普通 Markdown 文件，作者可以直接查看和编辑。</p>
          <div className="editor-actions">
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(props.confirmedFactsPath)}>事实库</button>
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(props.openLoopsPath)}>伏笔</button>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>导出当前章</h2>
            <span>{props.lastExportedPath || '尚未导出'}</span>
          </div>
          <div className="editor-actions">
            <button type="button" className="ghost-button" onClick={() => props.onExportProject('markdown', 'chapter')}>MD</button>
            <button type="button" className="ghost-button" onClick={() => props.onExportProject('txt', 'chapter')}>TXT</button>
            <button type="button" className="ghost-button" onClick={() => props.onExportProject('docx', 'chapter')}>DOCX</button>
          </div>
        </section>
      </aside>
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

function estimateTextUnits(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return 0
  const latinWords = trimmed.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0
  const cjkChars = trimmed.match(/[\u3400-\u9fff]/g)?.length ?? 0
  return latinWords + cjkChars
}

function countParagraphs(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length
}

function LocalFilesPanel(props: Props) {
  return (
    <section className="local-files-layout">
      <div className="local-files-list">
        <div className="editor-actions local-file-preview-actions">
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFile}>导入文件</button>
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFolder}>导入文件夹</button>
        </div>
        {groupMarkdownFiles(props.markdownFiles).map(([category, files]) => (
          <div className="local-file-group" key={category}>
            <h2>{category}</h2>
            {files.map((file) => (
              <div className="local-file-row local-file-row-with-action" key={file.relative_path}>
                <button type="button" className="local-file-open" onClick={() => props.onLoadMarkdownFile(file.relative_path)}>
                  <strong>{file.relative_path}</strong>
                  <span>{formatBytes(file.bytes)}</span>
                </button>
                <button type="button" className="local-file-locate" onClick={() => props.onRevealProjectPath(file.relative_path)}>
                  定位
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <MarkdownDocument
        title="本地 Markdown"
        path={props.selectedMarkdownPath || '选择一个文件'}
        value={props.markdownPreview}
        onChange={props.onChangeMarkdownPreview}
        onSave={() => props.selectedMarkdownPath && props.onSaveModuleMarkdownFile(props.selectedMarkdownPath, props.markdownPreview)}
      />
    </section>
  )
}

function SkillPanel(props: Props) {
  return (
    <section className="local-files-layout">
      <div className="local-files-list">
        <button type="button" className="primary-button full-button" onClick={props.onImportSkillFile}>
          导入 Skill
        </button>
        {props.skillWarnings.length > 0 && (
          <ul className="skill-warning-list">
            {props.skillWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
        {props.skillFiles.map((file) => (
          <div className={`skill-row ${file.name === props.selectedSkillName ? 'active' : ''} ${file.disabled ? 'disabled' : ''}`} key={file.name}>
            <button type="button" className="skill-open" onClick={() => props.onLoadSkillFile(file.name)}>
              <strong>{file.name}</strong>
              <span>{file.relative_path} · {formatBytes(file.bytes)}</span>
            </button>
            <div className="skill-state-row">
              <label>
                <input
                  type="checkbox"
                  checked={!file.disabled}
                  onChange={(event) => props.onSetSkillDisabled(file.name, !event.target.checked)}
                />
                Enabled
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={file.temporary}
                  onChange={(event) => props.onSetTemporarySkill(file.name, event.target.checked)}
                />
                Temporary
              </label>
            </div>
          </div>
        ))}
      </div>
      <MarkdownDocument
        title="已选 Skill"
        path={props.selectedSkillName || 'skills/selected'}
        value={props.skillPreview}
        onChange={() => undefined}
        onSave={() => undefined}
      />
    </section>
  )
}

function TasksPanel(props: Props) {
  const [pinnedContext, setPinnedContext] = useState<PinnedContextItem[]>([])
  const [pinnedStatus, setPinnedStatus] = useState('尚未读取钉选材料')
  const currentPath = props.activeModuleView === 'tasks-history' ? 'tasks/history.jsonl' : 'tasks/current.json'
  const isHistory = props.activeModuleView === 'tasks-history'

  async function refreshPinnedContext() {
    setPinnedStatus('正在读取钉选材料...')
    const items = await props.onListPinnedContext()
    setPinnedContext(items)
    setPinnedStatus(`已钉选 ${items.length} 条`)
  }

  if (isHistory) {
    return (
      <section className="system-events-panel">
        <TaskStatusStrip tasks={props.tasks} />
        <MarkdownDocument
          title="任务历史"
          path={props.selectedMarkdownPath || currentPath}
          value={props.markdownPreview}
          onChange={props.onChangeMarkdownPreview}
          onSave={() => props.onSaveModuleMarkdownFile(props.selectedMarkdownPath || currentPath, props.markdownPreview)}
        />
      </section>
    )
  }

  return (
    <section className="system-events-panel">
      <TaskStatusStrip tasks={props.tasks} />
      <section className="split-editor-layout">
        <ChapterList {...props} />
        <MarkdownDocument
          title="章节任务书"
          path={props.writingBriefPath}
          value={props.writingBrief}
          onChange={props.onChangeWritingBrief}
          onSave={() => props.onSaveModuleMarkdownFile(props.writingBriefPath, props.writingBrief)}
          actions={
            <>
              <button type="button" className="ghost-button" onClick={props.onComposeBrief}>装配任务书</button>
              <button type="button" className="ghost-button" onClick={() => void refreshPinnedContext()}>钉选材料</button>
              <button type="button" className="primary-button" onClick={props.onGenerateCandidate}>生成候选稿</button>
            </>
          }
        />
      </section>
      <section className="pinned-context-panel">
        <div className="panel-heading">
          <h2>钉选材料</h2>
          <span>{pinnedStatus}</span>
        </div>
        {pinnedContext.length === 0 ? (
          <p className="empty-note">在知识库中检索本地材料，并把选中的结果钉选进本章任务书。</p>
        ) : (
          <div className="pinned-context-list">
            {pinnedContext.map((item) => (
              <article className="pinned-context-item" key={`${item.index}-${item.source_path}`}>
                <span>{item.source_path}:{item.line_number}</span>
                <p>{item.snippet}</p>
                <div className="search-result-actions">
                  <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(item.source_path)}>
                    打开来源
                  </button>
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
        )}
      </section>
    </section>
  )
}

function TaskStatusStrip({ tasks }: { tasks: TaskItem[] }) {
  return (
    <div className="task-overview-strip">
      {tasks.map((task) => (
        <article key={task.id}>
          <span>{task.id}</span>
          <strong>{task.label}</strong>
          <p className={`task ${task.status}`}>{task.status}</p>
        </article>
      ))}
    </div>
  )
}

function LogsPanel(props: Props) {
  const files = props.markdownFiles.filter((file) =>
    file.relative_path.startsWith('logs/') ||
    file.relative_path === 'facts/author-confirmation.md' ||
    file.relative_path.startsWith('.olienta-events/'),
  )
  return (
    <DocumentHubPanel
      title={props.activeModuleView === 'logs-system-events' ? '系统事件' : '作者确认日志'}
      files={files}
      selectedPath={props.selectedMarkdownPath}
      content={props.markdownPreview}
      onLoad={props.onLoadMarkdownFile}
      onChange={props.onChangeMarkdownPreview}
      onSave={props.onSaveModuleMarkdownFile}
      onReveal={props.onRevealProjectPath}
    />
  )
}

function ModelCallsPanel(props: Props) {
  if (props.activeModuleView === 'model-providers' || props.activeView === 'ai-providers') {
    return <ProviderPanel {...props} />
  }

  const defaultPath = props.activeModuleView === 'model-tests'
    ? 'logs/model-calls/history.md'
    : 'logs/model-calls/history.md'

  return (
    <section className="system-events-panel">
      <div className="provider-test-card">
        <span>Provider 测试</span>
        <strong>{props.providerTestMessage}</strong>
        <p>{props.aiProvidersPath}</p>
        <div className="editor-actions">
          <button type="button" className="ghost-button" onClick={props.onTestAiProvider}>运行测试</button>
          <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(defaultPath)}>打开历史</button>
        </div>
      </div>
      <MarkdownDocument
        title={props.activeModuleView === 'model-tests' ? '连接测试记录' : '模型调用记录'}
        path={props.selectedMarkdownPath || defaultPath}
        value={props.markdownPreview}
        onChange={props.onChangeMarkdownPreview}
        onSave={() => props.onSaveModuleMarkdownFile(props.selectedMarkdownPath || defaultPath, props.markdownPreview)}
      />
    </section>
  )
}

function DocumentHubPanel(props: {
  title: string
  files: MarkdownFileSummary[]
  selectedPath: string
  content: string
  onLoad: (relativePath: string) => void
  onChange: (content: string) => void
  onSave: (relativePath: string, content: string) => void
  onReveal: (relativePath: string) => void
}) {
  const path = props.selectedPath || props.files[0]?.relative_path || '选择一个文件'
  return (
    <section className="module-document-layout">
      <div className="module-document-list">
        {props.files.length === 0 && <p className="empty-note">暂时没有匹配的本地文件。</p>}
        {props.files.map((file) => (
          <div className="local-file-row local-file-row-with-action" key={file.relative_path}>
            <button type="button" className="local-file-open" onClick={() => props.onLoad(file.relative_path)}>
              <strong>{file.relative_path}</strong>
              <span>{file.category} · {formatBytes(file.bytes)}</span>
            </button>
            <button type="button" className="local-file-locate" onClick={() => props.onReveal(file.relative_path)}>
              定位
            </button>
          </div>
        ))}
      </div>
      <MarkdownDocument
        title={props.title}
        path={path}
        value={props.content}
        onChange={props.onChange}
        onSave={() => props.selectedPath && props.onSave(props.selectedPath, props.content)}
      />
    </section>
  )
}

function groupMarkdownFiles(files: MarkdownFileSummary[]) {
  const groups = new Map<string, MarkdownFileSummary[]>()
  for (const file of files) {
    const group = groups.get(file.category) ?? []
    group.push(file)
    groups.set(file.category, group)
  }
  return Array.from(groups.entries())
}

function ProviderPanel(props: Props) {
  return <MarkdownDocument title="AI Provider 配置" path=".olienta/ai-providers.json" value={props.aiProvidersJson} onChange={props.onChangeAiProvidersJson} onSave={props.onSaveAiProviders} actions={<><button className="ghost-button" onClick={props.onTestAiProvider}>测试</button><span className="status-pill">{props.providerTestMessage}</span></>} />
}

function ExportPanel(props: Props) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>导出</h2></div>
      <ExportPanelActions {...props} />
      {props.lastExportedPath && <p className="empty-note">最近导出：{props.lastExportedPath}</p>}
    </section>
  )
}

function ExportPanelActions(props: Props) {
  return <div className="editor-actions"><button className="ghost-button" onClick={() => props.onExportProject('markdown', 'all')}>导出全书 MD</button><button className="ghost-button" onClick={() => props.onExportProject('txt', 'all')}>导出 TXT</button><button className="ghost-button" onClick={() => props.onExportProject('docx', 'all')}>导出 DOCX</button></div>
}

function MarkdownDocument(props: { title: string; path: string; value: string; onChange: (value: string) => void; onSave: () => void; actions?: React.ReactNode }) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  return (
    <section className="editor-card module-document-panel">
      <div className="card-heading"><div><h2>{props.title}</h2><p>{props.path}</p></div><div className="editor-actions"><button className="ghost-button" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>{mode === 'edit' ? '预览' : '编辑'}</button>{props.actions}<button className="primary-button" onClick={props.onSave}>保存</button></div></div>
      {mode === 'edit' ? <textarea className="markdown-preview source" value={props.value} onChange={(event) => props.onChange(event.target.value)} /> : <pre className="markdown-rendered local-markdown-rendered">{props.value || '暂无内容。'}</pre>}
    </section>
  )
}

function ChapterList(props: Props) {
  return <aside className="chapter-list-panel">{props.chapters.map((chapter) => <button className={`chapter-list-item ${chapter.id === props.selectedChapterId ? 'active' : ''}`} key={chapter.id} onClick={() => props.onSelectChapter(chapter.id)}><span>{chapter.id}</span><strong>{chapter.title}</strong><small>{chapter.word_count ?? 0} 字</small></button>)}</aside>
}

function FocusMode(props: Props) {
  return <section className="focus-mode"><div className="focus-topbar"><strong>{props.currentChapter.title}</strong><span>{props.saveState}</span><button onClick={props.onSaveChapter}>保存</button></div><textarea value={props.manuscript} onChange={(event) => props.onChangeManuscript(event.target.value)} /></section>
}

function openAgent() {
  window.dispatchEvent(new CustomEvent('olienta:open-agent'))
}

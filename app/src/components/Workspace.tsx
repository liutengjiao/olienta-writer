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
  home: 'Home',
  'project-structure': 'Project Structure',
  knowledge: 'Knowledge Base',
  characters: 'Characters',
  tasks: 'Tasks',
  logs: 'Logs',
  'model-calls': 'Model Calls',
}

const VIEW_TITLES: Record<string, string> = {
  'novel-settings': 'Novel Settings',
  'story-premise': 'Story Premise',
  characters: 'Character Map',
  world: 'Worldbuilding',
  'plot-outline': 'Plot Outline',
  timeline: 'Timeline and Milestones',
  'chapter-blueprint': 'Chapter Blueprint',
  'draft-box': 'Draft Box',
  manuscript: 'Manuscript',
  facts: 'Fact Base',
  skills: 'Skills',
  'ai-providers': 'AI Providers',
  exports: 'Export',
  'local-files': 'Local Markdown Files',
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
    : 'Local-first novel writing workspace. Open or create a project to edit Markdown files directly.'

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
        <button type="button" className="ghost-button assistant-page-button" onClick={openAgent}>Call Assistant</button>
      </div>
      {props.children}
    </section>
  )
}

function HomePanel(props: Props) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>Project Entry</h2></div>
      <div className="settings-grid">
        <label>Project name<input value={props.form.name} onChange={(event) => props.onUpdateForm('name', event.target.value)} /></label>
        <label>Folder<input value={props.form.root_path} onChange={(event) => props.onUpdateForm('root_path', event.target.value)} /></label>
        <label>Language<input value={props.form.language} onChange={(event) => props.onUpdateForm('language', event.target.value)} /></label>
        <label>Chapters<input type="number" value={props.form.chapter_count} onChange={(event) => props.onUpdateForm('chapter_count', Number(event.target.value))} /></label>
      </div>
      <div className="editor-actions">
        <button className="ghost-button" onClick={props.onChooseFolder}>Choose folder</button>
        <button className="ghost-button" onClick={props.onOpenProject}>Open project</button>
        <button className="ghost-button" onClick={props.onOpenSampleProject}>Open sample</button>
        <button className="primary-button" onClick={props.onCreateProject} disabled={props.busy}>Create project</button>
      </div>
    </section>
  )
}

function NovelSettingsPanel(props: Props) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>Novel Settings</h2></div>
      <HomePanel {...props} />
    </section>
  )
}

function FrameworkPanel(props: Props) {
  const path = FRAMEWORK_PATHS[props.activeView] ?? props.frameworkPath
  return <MarkdownDocument title={VIEW_TITLES[props.activeView] ?? 'Framework'} path={path} value={props.frameworkContent || props.markdownPreview} onChange={props.onChangeMarkdownPreview} onSave={() => props.onSaveModuleMarkdownFile(path, props.markdownPreview || props.frameworkContent)} />
}

function BlueprintPanel(props: Props) {
  return (
    <section className="split-editor-layout">
      <ChapterList {...props} />
      <MarkdownDocument title="Chapter Blueprint" path={props.blueprintPath} value={props.blueprint} onChange={props.onChangeBlueprint} onSave={props.onSaveBlueprint} actions={<><button className="ghost-button" onClick={props.onGenerateBlueprintDraft}>Generate draft</button><button className="ghost-button" onClick={props.onComposeBrief}>Assemble brief</button></>} />
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
              <h2>Candidate Review Flow</h2>
              <p>AI output stays in the candidate draft until the author explicitly adopts it.</p>
            </div>
            <span>{props.currentChapter.title}</span>
          </div>
          <div className="chapter-chain-steps">
            <article className="chapter-chain-step confirmed">
              <div><strong>Brief</strong><span>{props.writingBriefPath}</span></div>
              <p>Assembled from blueprint, author input, facts, skills and pinned materials.</p>
            </article>
            <article className="chapter-chain-step active">
              <div><strong>Candidate</strong><span>{props.candidatePath}</span></div>
              <p>Edit, review and save the candidate before it can affect confirmed manuscript.</p>
            </article>
            <article className="chapter-chain-step draft">
              <div><strong>Manuscript</strong><span>{props.selectedChapterId}</span></div>
              <p>Only replace or append writes candidate text into the confirmed chapter.</p>
            </article>
          </div>
        </section>

        <MarkdownDocument
          title="Candidate Draft"
          path={props.candidatePath}
          value={props.candidate}
          onChange={props.onChangeCandidate}
          onSave={props.onSaveCandidate}
          actions={
            <>
              <button className="ghost-button" onClick={props.onComposeBrief}>Assemble brief</button>
              <button className="ghost-button" onClick={props.onGenerateCandidate}>Generate</button>
              <button className="ghost-button" onClick={props.onClearCandidate}>Clear</button>
              <button className="ghost-button" onClick={() => props.onAdoptCandidate('append')}>Append</button>
              <button className="primary-button" onClick={() => props.onAdoptCandidate('replace')}>Replace</button>
            </>
          }
        />

        <section className="draft-diff-card">
          <div className="card-heading">
            <div>
              <h2>Candidate vs Manuscript</h2>
              <p>Lightweight review stats before adoption.</p>
            </div>
            <span className="status-pill">{props.candidateReviewPath}</span>
          </div>
          <div className="health-strip">
            <article><span>Candidate units</span><strong>{candidateUnits}</strong></article>
            <article><span>Manuscript units</span><strong>{manuscriptUnits}</strong></article>
            <article><span>Paragraph delta</span><strong>{candidateParagraphs - manuscriptParagraphs}</strong></article>
          </div>
        </section>

        {props.candidateWarnings.length > 0 && (
          <section className="warning-list">
            <div className="card-heading">
              <h2>Review Warnings</h2>
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
          <h2>History</h2>
          <span>{props.candidateHistory.length}</span>
        </div>
        <div className="compact-list">
          {props.candidateHistory.length === 0 && <p className="empty-note">No saved candidate history yet.</p>}
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
          value={props.candidateHistoryPreview || 'Select a saved candidate version to preview it.'}
        />
        <button
          type="button"
          className="primary-button"
          disabled={!props.selectedCandidateHistoryPath}
          onClick={props.onRestoreCandidateHistory}
        >
          Restore to editor
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
              <h2>Confirmed Manuscript</h2>
              <p>Saving this chapter records author confirmation and refreshes downstream memory.</p>
            </div>
            <span>{props.saveState}</span>
          </div>
          <div className="chapter-chain-steps">
            <article className="chapter-chain-step confirmed">
              <div><strong>Chapter file</strong><span>{props.chapterPath}</span></div>
              <p>Plain Markdown remains the source of truth for confirmed manuscript text.</p>
            </article>
            <article className="chapter-chain-step draft">
              <div><strong>Candidate available</strong><span>{candidateUnits}</span></div>
              <p>Candidate text can be appended or replaced from the Draft Box, never silently adopted.</p>
            </article>
            <article className="chapter-chain-step active">
              <div><strong>Facts</strong><span>{props.confirmedFactsPath}</span></div>
              <p>Use rescan after major edits to refresh confirmed facts from saved chapters.</p>
            </article>
          </div>
        </section>

        <MarkdownDocument
          title="Manuscript"
          path={props.chapterPath}
          value={props.manuscript}
          onChange={props.onChangeManuscript}
          onSave={props.onSaveChapter}
          actions={
            <>
              <button type="button" className="ghost-button" onClick={props.onToggleFocusMode}>Focus</button>
              <button type="button" className="ghost-button" onClick={props.onRescanFacts}>Rescan facts</button>
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('markdown', 'chapter')}>Export MD</button>
              <button type="button" className="ghost-button" onClick={() => props.onExportProject('txt', 'chapter')}>Export TXT</button>
            </>
          }
        />
      </div>

      <aside className="confirmation-side">
        <section className="review-card">
          <div className="panel-heading">
            <h2>Chapter State</h2>
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
            <h2>Author Confirmation</h2>
            <span>Local log</span>
          </div>
          <p className="empty-note">Save writes confirmation metadata and commit-style events without moving AI text unless you explicitly adopt a candidate.</p>
          <div className="editor-actions">
            <button type="button" className="primary-button" onClick={props.onSaveChapter}>Save confirmed text</button>
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile('facts/author-confirmation.md')}>Open log</button>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>Memory</h2>
            <span>{props.openLoopsPath}</span>
          </div>
          <p className="empty-note">Facts and open loops are stored as normal Markdown files, so the author can inspect and edit them directly.</p>
          <div className="editor-actions">
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(props.confirmedFactsPath)}>Facts</button>
            <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(props.openLoopsPath)}>Open loops</button>
          </div>
        </section>

        <section className="review-card">
          <div className="panel-heading">
            <h2>Export Current Chapter</h2>
            <span>{props.lastExportedPath || 'Not exported'}</span>
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
          <span>Project health</span>
          <strong>{healthStatus}</strong>
          <p>{props.projectHealth ? `${props.projectHealth.missing_count} missing, ${props.projectHealth.warning_count} warnings` : 'Open a project to inspect local structure.'}</p>
        </article>
        <article>
          <span>Markdown files</span>
          <strong>{markdownCount}</strong>
          <p>Local project files that can be inspected without a database.</p>
        </article>
        <article>
          <span>Knowledge files</span>
          <strong>{referenceCount}</strong>
          <p>Imported notes, indexes, search docs and fact files.</p>
        </article>
      </div>

      <div className="knowledge-import-actions editor-card">
        <div>
          <h2>Local Knowledge Intake</h2>
          <p className="empty-note">Import Markdown/TXT references into the project folder, then pin useful excerpts into chapter briefs.</p>
        </div>
        <div className="editor-actions">
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFile}>Import file</button>
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFolder}>Import folder</button>
          <button type="button" className="ghost-button" onClick={props.onRevealProjectFolder}>Open folder</button>
          <button type="button" className="primary-button" onClick={props.onRepairProjectStructure}>Repair structure</button>
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
        title="Confirmed Facts"
        path={props.confirmedFactsPath}
        value={props.confirmedFacts}
        onChange={props.onChangeConfirmedFacts}
        onSave={() => props.onSaveKnowledgeFile('confirmed-facts')}
        actions={<button type="button" className="ghost-button" onClick={props.onRescanFacts}>Rescan manuscript</button>}
      />
      <MarkdownDocument
        title="Open Loops"
        path={props.openLoopsPath}
        value={props.openLoops}
        onChange={props.onChangeOpenLoops}
        onSave={() => props.onSaveKnowledgeFile('open-loops')}
      />
    </section>
  )
}

const SEARCH_SCOPES = [
  { key: 'all', title: 'All', detail: 'Every readable project text file' },
  { key: 'imported', title: 'Imported', detail: 'knowledge/markdown/imported' },
  { key: 'framework', title: 'Framework', detail: 'setting, premise, plot, world' },
  { key: 'manuscript', title: 'Manuscript', detail: 'chapters, blueprints, candidates' },
  { key: 'memory', title: 'Memory', detail: 'facts, tasks, logs' },
]

function KnowledgeSearchPanel(props: Props) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [results, setResults] = useState<ProjectSearchResult[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [pinnedContext, setPinnedContext] = useState<PinnedContextItem[]>([])
  const [status, setStatus] = useState('Ready')

  async function runSearch() {
    const trimmed = query.trim()
    if (!trimmed) {
      setStatus('Enter a search query.')
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
          snippet: `Preview match for "${trimmed}" in ${file.relative_path}`,
        }))
      setResults(previewResults)
      setSelectedKeys([])
      setStatus(`${previewResults.length} preview matches`)
      return
    }

    setStatus('Searching...')
    try {
      const found = isTauriRuntime
        ? await tauriApi.searchProjectTextFilesScoped(props.project.root_path, trimmed, scope)
        : []
      setResults(found)
      setSelectedKeys([])
      setStatus(`${found.length} matches`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshPinnedContext() {
    setStatus('Loading pinned context...')
    const pinned = await props.onListPinnedContext()
    setPinnedContext(pinned)
    setStatus(`${pinned.length} pinned items`)
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
          <h2>Local Full Text Search</h2>
          <p>Search local project files and pin useful evidence into the current chapter brief.</p>
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
          placeholder="Search project text files"
        />
        <button type="button" className="primary-button" onClick={() => void runSearch()}>Search</button>
        <button type="button" className="ghost-button" onClick={() => void refreshPinnedContext()}>Pinned</button>
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
              <span>{selectedKeys.length} selected</span>
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={selectedResults.length === 0}
              onClick={() => props.onPinSearchResultsToBrief(selectedResults)}
            >
              Pin selected
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
                Open
              </button>
              <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(result.relative_path)}>
                Locate
              </button>
              <button type="button" className="primary-button" onClick={() => props.onPinSearchResultToBrief(result)}>
                Pin
              </button>
            </div>
          </article>
        ))}
      </div>

      {pinnedContext.length > 0 && (
        <section className="pinned-context-panel">
          <div className="panel-heading">
            <h2>Pinned Context</h2>
            <span>{pinnedContext.length} items for chapter {props.selectedChapterId}</span>
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
                    Remove
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
          <h2>Project Structure Health</h2>
          <p className="empty-note">{report ? 'Required local files and folders for the current writing project.' : 'Open a project to inspect its local file structure.'}</p>
        </div>
        <div className="health-side-actions">
          <button type="button" className="ghost-button" onClick={props.onRevealProjectFolder}>Open folder</button>
          <button type="button" className="primary-button" onClick={props.onRepairProjectStructure}>Repair</button>
        </div>
      </div>
      <div className="health-strip">
        <article><span>Status</span><strong>{report?.status ?? 'No project'}</strong></article>
        <article><span>Missing</span><strong>{report?.missing_count ?? 0}</strong></article>
        <article><span>Warnings</span><strong>{report?.warning_count ?? 0}</strong></article>
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
    note: 'Generated index and individual cards stored under characters/cards.',
  },
  'characters-relations': {
    title: 'Relationship Map',
    path: 'characters/relations.md',
    note: 'Relationship, desire, interest and conflict notes extracted from character material.',
  },
  'characters-growth': {
    title: 'Growth Line',
    path: 'characters/growth.md',
    note: 'Character state changes and chapter-positioned growth notes.',
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
            <dd>{hasMarkdownFile(props.markdownFiles, 'characters/relations.md') ? 'Ready' : 'Missing'}</dd>
          </div>
          <div>
            <dt>Growth</dt>
            <dd>{hasMarkdownFile(props.markdownFiles, 'characters/growth.md') ? 'Ready' : 'Missing'}</dd>
          </div>
        </dl>
      </div>

      <section className="character-workspace-layout">
        <aside className="character-card-list">
          <button type="button" className="primary-button" onClick={props.onExtractCharacterCards}>
            Extract cards
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
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFile}>Import file</button>
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFolder}>Import folder</button>
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
                  Locate
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <MarkdownDocument
        title="Local Markdown"
        path={props.selectedMarkdownPath || 'Select a file'}
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
          Import Skill
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
        title="Selected Skill"
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
  const [pinnedStatus, setPinnedStatus] = useState('Pinned context not loaded')
  const currentPath = props.activeModuleView === 'tasks-history' ? 'tasks/history.jsonl' : 'tasks/current.json'
  const isHistory = props.activeModuleView === 'tasks-history'

  async function refreshPinnedContext() {
    setPinnedStatus('Loading pinned context...')
    const items = await props.onListPinnedContext()
    setPinnedContext(items)
    setPinnedStatus(`${items.length} pinned items`)
  }

  if (isHistory) {
    return (
      <section className="system-events-panel">
        <TaskStatusStrip tasks={props.tasks} />
        <MarkdownDocument
          title="Task History"
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
          title="Chapter Writing Brief"
          path={props.writingBriefPath}
          value={props.writingBrief}
          onChange={props.onChangeWritingBrief}
          onSave={() => props.onSaveModuleMarkdownFile(props.writingBriefPath, props.writingBrief)}
          actions={
            <>
              <button type="button" className="ghost-button" onClick={props.onComposeBrief}>Assemble brief</button>
              <button type="button" className="ghost-button" onClick={() => void refreshPinnedContext()}>Pinned</button>
              <button type="button" className="primary-button" onClick={props.onGenerateCandidate}>Generate candidate</button>
            </>
          }
        />
      </section>
      <section className="pinned-context-panel">
        <div className="panel-heading">
          <h2>Pinned Materials</h2>
          <span>{pinnedStatus}</span>
        </div>
        {pinnedContext.length === 0 ? (
          <p className="empty-note">Search local materials in Knowledge Base and pin selected results into this chapter brief.</p>
        ) : (
          <div className="pinned-context-list">
            {pinnedContext.map((item) => (
              <article className="pinned-context-item" key={`${item.index}-${item.source_path}`}>
                <span>{item.source_path}:{item.line_number}</span>
                <p>{item.snippet}</p>
                <div className="search-result-actions">
                  <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(item.source_path)}>
                    Open source
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => {
                      void props.onRemovePinnedContextItem(item.index).then(refreshPinnedContext)
                    }}
                  >
                    Remove
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
      title={props.activeModuleView === 'logs-system-events' ? 'System Events' : 'Author Confirmation Log'}
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
        <span>Provider test</span>
        <strong>{props.providerTestMessage}</strong>
        <p>{props.aiProvidersPath}</p>
        <div className="editor-actions">
          <button type="button" className="ghost-button" onClick={props.onTestAiProvider}>Run test</button>
          <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(defaultPath)}>Open history</button>
        </div>
      </div>
      <MarkdownDocument
        title={props.activeModuleView === 'model-tests' ? 'Connection Test Log' : 'Model Call Records'}
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
  const path = props.selectedPath || props.files[0]?.relative_path || 'Select a file'
  return (
    <section className="module-document-layout">
      <div className="module-document-list">
        {props.files.length === 0 && <p className="empty-note">No matching local files yet.</p>}
        {props.files.map((file) => (
          <div className="local-file-row local-file-row-with-action" key={file.relative_path}>
            <button type="button" className="local-file-open" onClick={() => props.onLoad(file.relative_path)}>
              <strong>{file.relative_path}</strong>
              <span>{file.category} · {formatBytes(file.bytes)}</span>
            </button>
            <button type="button" className="local-file-locate" onClick={() => props.onReveal(file.relative_path)}>
              Locate
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
  return <MarkdownDocument title="AI Provider Config" path=".olienta/ai-providers.json" value={props.aiProvidersJson} onChange={props.onChangeAiProvidersJson} onSave={props.onSaveAiProviders} actions={<><button className="ghost-button" onClick={props.onTestAiProvider}>Test</button><span className="status-pill">{props.providerTestMessage}</span></>} />
}

function ExportPanel(props: Props) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>Export</h2></div>
      <ExportPanelActions {...props} />
      {props.lastExportedPath && <p className="empty-note">Last exported: {props.lastExportedPath}</p>}
    </section>
  )
}

function ExportPanelActions(props: Props) {
  return <div className="editor-actions"><button className="ghost-button" onClick={() => props.onExportProject('markdown', 'all')}>Export all MD</button><button className="ghost-button" onClick={() => props.onExportProject('txt', 'all')}>Export TXT</button><button className="ghost-button" onClick={() => props.onExportProject('docx', 'all')}>Export DOCX</button></div>
}

function MarkdownDocument(props: { title: string; path: string; value: string; onChange: (value: string) => void; onSave: () => void; actions?: React.ReactNode }) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  return (
    <section className="editor-card module-document-panel">
      <div className="card-heading"><div><h2>{props.title}</h2><p>{props.path}</p></div><div className="editor-actions"><button className="ghost-button" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>{mode === 'edit' ? 'Preview' : 'Edit'}</button>{props.actions}<button className="primary-button" onClick={props.onSave}>Save</button></div></div>
      {mode === 'edit' ? <textarea className="markdown-preview source" value={props.value} onChange={(event) => props.onChange(event.target.value)} /> : <pre className="markdown-rendered local-markdown-rendered">{props.value || 'No content.'}</pre>}
    </section>
  )
}

function ChapterList(props: Props) {
  return <aside className="chapter-list-panel">{props.chapters.map((chapter) => <button className={`chapter-list-item ${chapter.id === props.selectedChapterId ? 'active' : ''}`} key={chapter.id} onClick={() => props.onSelectChapter(chapter.id)}><span>{chapter.id}</span><strong>{chapter.title}</strong><small>{chapter.word_count ?? 0} words</small></button>)}</aside>
}

function FocusMode(props: Props) {
  return <section className="focus-mode"><div className="focus-topbar"><strong>{props.currentChapter.title}</strong><span>{props.saveState}</span><button onClick={props.onSaveChapter}>Save</button></div><textarea value={props.manuscript} onChange={(event) => props.onChangeManuscript(event.target.value)} /></section>
}

function openAgent() {
  window.dispatchEvent(new CustomEvent('olienta:open-agent'))
}

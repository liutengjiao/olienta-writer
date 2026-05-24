import { useEffect, useMemo, useState } from 'react'
import type { ContractFulfillmentSummary, MarkdownFileSummary, PinnedContextItem, TaskItem } from '../../types'
import type { WorkspaceProps } from './types'
import { MarkdownDocument } from './EditorPanels'
import { classifyModelCallFailure, estimateModelCallCost, filterModelCallEntries, parseModelCallHistory, summarizeModelCallCosts, summarizeModelCallFailures, summarizeModelCallHistory, summarizeModelCallProviders, summarizeModelCallTasks } from '../../lib/modelCallLogic'
import { isTauriRuntime } from '../../constants'
import * as tauriApi from '../../api/tauriApi'

export function LocalFilesPanel(props: WorkspaceProps) {
  const groups = useMemo(() => groupMarkdownFiles(props.markdownFiles), [props.markdownFiles])

  return (
    <section className="local-files-layout">
      <div className="local-files-list">
        <div className="editor-actions local-file-preview-actions">
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFile}>导入文件</button>
          <button type="button" className="ghost-button" onClick={props.onImportReferenceFolder}>导入文件夹</button>
        </div>
        <p className="local-file-hint">只读浏览当前作品文件夹内的 Markdown、TXT、JSON 和日志文件。</p>
        <div className="local-file-tree" role="tree" aria-label="项目文件目录">
          {groups.map(([category, files]) => (
          <details className="local-file-group" key={category} open>
            <summary>
              <span>{category}</span>
              <small>{files.length}</small>
            </summary>
            {files.map((file) => (
              <div
                className={`local-file-row local-file-row-with-action ${props.selectedMarkdownPath === file.relative_path ? 'active' : ''}`}
                key={file.relative_path}
                role="treeitem"
              >
                <button type="button" className="local-file-open" onClick={() => props.onLoadMarkdownFile(file.relative_path)}>
                  <strong>{formatLocalFileTitle(file)}</strong>
                  <span>{formatLocalFileSubtitle(file)} · {formatBytes(file.bytes)}</span>
                </button>
                <button type="button" className="local-file-locate" onClick={() => props.onRevealProjectPath(file.relative_path)}>
                  定位
                </button>
              </div>
            ))}
          </details>
          ))}
          {groups.length === 0 && <p className="empty-note">打开项目后，这里会显示项目目录下可预览的文本文件。</p>}
          </div>
      </div>
      <MarkdownDocument
        title={props.selectedMarkdownPath ? formatLocalFileTitle({ relative_path: props.selectedMarkdownPath, category: '' }) : '本地 Markdown 阅读器'}
        path={props.selectedMarkdownPath || '选择一个文件'}
        value={props.markdownPreview}
        onChange={() => undefined}
        onSave={() => undefined}
        readOnly
      />
    </section>
  )
}

function formatLocalFileTitle(file: Pick<MarkdownFileSummary, 'relative_path' | 'category'>) {
  const path = file.relative_path
  const chapter = path.match(/(?:^|\/)(\d{3,4})\.md$/)?.[1]
  if (path.startsWith('framework/')) return frameworkFileTitle(path)
  if (path.startsWith('blueprints/chapters/')) return chapter ? `蓝图 · 第 ${Number(chapter)} 章` : '章节蓝图'
  if (path.startsWith('blueprints/drafts/')) return chapter ? `蓝图草稿 · 第 ${Number(chapter)} 章` : '蓝图草稿'
  if (path.startsWith('manuscript/chapters/')) return chapter ? `正文 · 第 ${Number(chapter)} 章` : '正文'
  if (path.startsWith('manuscript/author-input/')) return chapter ? `作者输入 · 第 ${Number(chapter)} 章` : '作者输入'
  if (path.startsWith('manuscript/candidates/')) return chapter ? `候选稿 · 第 ${Number(chapter)} 章` : '候选稿'
  if (path.startsWith('tasks/writing-briefs/')) return chapter ? `写作要求 · 第 ${Number(chapter)} 章` : '写作要求'
  if (path.startsWith('facts/')) return factsFileTitle(path)
  if (path.startsWith('timeline/')) return path.endsWith('milestones.md') ? '时间线里程碑' : '时间线事件'
  if (path.startsWith('characters/cards/')) return path.endsWith('INDEX.md') ? '角色卡索引' : path.endsWith('README.md') ? '角色卡说明' : `角色卡 · ${fileNameWithoutExtension(path)}`
  if (path === 'characters/relations.md') return '关系图谱'
  if (path === 'characters/growth.md') return '角色成长线'
  if (path.startsWith('skills/selected/')) return `Skill · ${fileNameWithoutExtension(path)}`
  if (path.startsWith('logs/model-calls/')) return path.endsWith('history.md') ? '模型调用记录' : '模型调用说明'
  if (path.startsWith('logs/confirmations/')) return `确认日志 · ${fileNameWithoutExtension(path)}`
  if (path.startsWith('knowledge/markdown/imported/')) return `导入资料 · ${fileNameWithoutExtension(path)}`
  if (path.startsWith('exports/')) return `导出文件 · ${fileNameWithoutExtension(path)}`
  return fileNameWithoutExtension(path) || path
}

function formatLocalFileSubtitle(file: MarkdownFileSummary) {
  return file.relative_path
}

function frameworkFileTitle(path: string) {
  const labels: Record<string, string> = {
    '01-setting.md': '故事框架 · 小说结构',
    '02-premise.md': '故事框架 · 故事梗概',
    '03-characters.md': '故事框架 · 角色图谱',
    '04-plot-outline.md': '故事框架 · 情节大纲',
    '05-world.md': '故事框架 · 世界观',
    '06-style.md': '故事框架 · 文风配置',
    '07-scenes.md': '故事框架 · 重要场景',
  }
  return labels[path.replace(/^framework\//, '')] ?? `故事框架 · ${fileNameWithoutExtension(path)}`
}

function factsFileTitle(path: string) {
  const labels: Record<string, string> = {
    'facts/confirmed-facts.md': '事实库 · 已确认事实',
    'facts/open-loops.md': '事实库 · 未闭合伏笔',
    'facts/forbidden-rules.md': '事实库 · 禁止违背',
    'facts/author-confirmation.md': '事实库 · 作者确认记录',
    'facts/character-facts.md': '事实库 · 角色事实',
    'facts/time-facts.md': '事实库 · 时间事实',
    'facts/location-facts.md': '事实库 · 地点事实',
    'facts/relation-facts.md': '事实库 · 关系事实',
    'facts/event-facts.md': '事实库 · 重要事件',
    'facts/world-rules.md': '事实库 · 世界规则',
  }
  return labels[path] ?? `事实库 · ${fileNameWithoutExtension(path)}`
}

function fileNameWithoutExtension(path: string) {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.(md|markdown|txt|json|jsonl)$/i, '')
}

export function SkillPanel(props: WorkspaceProps) {
  const selectedSkillPath = props.selectedSkillName ? `skills/selected/${props.selectedSkillName}` : 'skills/selected'

  return (
    <section className="local-files-layout">
      <div className="local-files-list">
        <div className="editor-actions skill-import-actions">
          <button type="button" className="primary-button" onClick={props.onImportSkillFile}>
            导入 Skill 文件
          </button>
          <button type="button" className="ghost-button" onClick={props.onImportSkillFolder}>
            导入 Skill 文件夹
          </button>
        </div>
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
            <div className="skill-meta-row" aria-label="Skill 分类和冲突标签">
              <span className="skill-category">{formatSkillCategory(file.category)}</span>
              <span>{formatSkillScope(file.scope)}</span>
              {file.conflict_tags.map((tag) => (
                <span className="skill-tag" key={tag}>{formatSkillTag(tag)}</span>
              ))}
            </div>
            <div className="skill-state-row">
              <label>
                <input
                  type="checkbox"
                  checked={!file.disabled}
                  onChange={(event) => props.onSetSkillDisabled(file.name, !event.target.checked)}
                />
                启用
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={file.temporary}
                  onChange={(event) => props.onSetTemporarySkill(file.name, event.target.checked)}
                />
                临时
              </label>
            </div>
          </div>
        ))}
      </div>
      <MarkdownDocument
        title="已选 Skill"
        path={selectedSkillPath}
        value={props.skillPreview}
        onChange={props.onChangeSkillPreview}
        onSave={() => props.selectedSkillName && props.onSaveModuleMarkdownFile(selectedSkillPath, props.skillPreview)}
      />
    </section>
  )
}

function formatSkillCategory(category: string) {
  const labels: Record<string, string> = {
    pacing: '节奏',
    style: '风格',
    structure: '结构',
    facts: '事实',
    blueprint: '蓝图',
    general: '通用',
  }
  return labels[category] || category
}

function formatSkillScope(scope: string) {
  const labels: Record<string, string> = {
    chapter: '章节',
    rewrite: '改写',
    project: '全书',
    general: '全局',
  }
  return labels[scope] || scope
}

function formatSkillTag(tag: string) {
  const labels: Record<string, string> = {
    'fast-pace': '快节奏',
    'slow-burn': '慢节奏',
    'strict-outline': '严格蓝图',
    'free-rewrite': '自由改写',
    'first-person': '第一人称',
    'third-person': '第三人称',
  }
  return labels[tag] || tag
}

export function TasksPanel(props: WorkspaceProps) {
  const [pinnedContext, setPinnedContext] = useState<PinnedContextItem[]>([])
  const [pinnedStatus, setPinnedStatus] = useState('尚未读取钉选材料')
  const [contractFulfillment, setContractFulfillment] = useState('')
  const [contractFulfillmentStatus, setContractFulfillmentStatus] = useState('保存正文后生成合同履约摘要。')
  const [contractFulfillmentSummary, setContractFulfillmentSummary] = useState<ContractFulfillmentSummary | null>(null)
  const isHistory = props.activeModuleView === 'tasks-history'
  const contractFulfillmentPath = `story-contracts/fulfillment/${props.selectedChapterId}.md`
  const contractFulfillmentJsonPath = `story-contracts/fulfillment/${props.selectedChapterId}.json`

  useEffect(() => {
    let cancelled = false
    async function loadContractFulfillment() {
      if (!props.project) {
        setContractFulfillment('')
        setContractFulfillmentSummary(null)
        setContractFulfillmentStatus('打开项目后显示合同履约摘要。')
        return
      }
      setContractFulfillmentStatus('正在读取合同履约摘要...')
      try {
        const loaded = await tauriApi.loadProjectMarkdownFile(props.project.root_path, contractFulfillmentPath)
        if (cancelled) return
        setContractFulfillment(loaded.content)
        setContractFulfillmentStatus(loaded.content.trim() ? '已读取当前章节合同履约摘要。' : '保存正文后生成合同履约摘要。')
      } catch {
        if (cancelled) return
        setContractFulfillment('')
        setContractFulfillmentStatus('保存正文后生成合同履约摘要。')
      }
      try {
        const loadedJson = await tauriApi.loadProjectMarkdownFile(props.project.root_path, contractFulfillmentJsonPath)
        if (cancelled) return
        setContractFulfillmentSummary(JSON.parse(loadedJson.content) as ContractFulfillmentSummary)
      } catch {
        if (cancelled) return
        setContractFulfillmentSummary(null)
      }
    }
    void loadContractFulfillment()
    return () => {
      cancelled = true
    }
  }, [props.project, contractFulfillmentPath, contractFulfillmentJsonPath])

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
          path=""
          value={formatJsonLogForAuthors(props.markdownPreview, 'task')}
          onChange={() => undefined}
          onSave={() => undefined}
          readOnly
          hideReadOnlyBadge
          hidePath
        />
      </section>
    )
  }

  return (
    <section className="system-events-panel">
      <TaskStatusStrip tasks={props.tasks} />
      <section className="current-task-main">
        <MarkdownDocument
          title={`第 ${Number(props.selectedChapterId)} 章写作要求`}
          path={props.writingBriefPath}
          value={props.writingBrief}
          onChange={props.onChangeWritingBrief}
          onSave={() => props.onSaveModuleMarkdownFile(props.writingBriefPath, props.writingBrief)}
          actions={
            <>
              <button type="button" className="ghost-button" onClick={props.onComposeBrief}>生成本章写作要求</button>
              <button type="button" className="ghost-button" onClick={() => void refreshPinnedContext()}>钉选材料</button>
              <button
                type="button"
                className="primary-button"
                onClick={props.onGenerateCandidate}
                disabled={props.candidateGenerationRunning}
              >
                {props.candidateGenerationRunning ? '生成中' : '生成候选稿'}
              </button>
              {props.candidateGenerationRunning && (
                <button type="button" className="ghost-button danger" onClick={props.onCancelCandidateGeneration}>
                  取消生成
                </button>
              )}
            </>
          }
        />
      </section>
      {props.candidateGenerationStatus && <p className="task-status-note">{props.candidateGenerationStatus}</p>}
      <ContractFulfillmentOverview
        summary={contractFulfillmentSummary}
        status={contractFulfillmentStatus}
        jsonPath={contractFulfillmentJsonPath}
        onRevealProjectPath={props.onRevealProjectPath}
      />
      <MarkdownDocument
        title="合同履约摘要"
        path=""
        value={contractFulfillment || `# 第 ${props.selectedChapterId} 章合同履约摘要\n\n${contractFulfillmentStatus}`}
        onChange={() => undefined}
        onSave={() => undefined}
        readOnly
        hideReadOnlyBadge
        hidePath
        actions={
          <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(contractFulfillmentPath)}>
            定位摘要
          </button>
        }
      />
      <section className="pinned-context-panel">
        <div className="panel-heading">
          <h2>钉选材料</h2>
          <span>{pinnedStatus}</span>
        </div>
        {pinnedContext.length === 0 ? (
          <p className="empty-note">在知识库中检索本地材料，并把选中的结果钉选进本章写作要求。</p>
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

function ContractFulfillmentOverview(props: {
  summary: ContractFulfillmentSummary | null
  status: string
  jsonPath: string
  onRevealProjectPath: (relativePath: string) => void
}) {
  const summary = props.summary
  if (!summary) {
    return (
      <section className="contract-fulfillment-overview empty">
        <div className="panel-heading">
          <h2>合同履约总览</h2>
          <span>{props.status}</span>
        </div>
        <p className="empty-note">保存正文后会生成结构化履约数据，用于显示完成率、缺失必须项和禁写触碰。</p>
      </section>
    )
  }

  const hasRisk = summary.missingRequiredCount > 0 || summary.touchedForbiddenCount > 0
  return (
    <section className={`contract-fulfillment-overview ${hasRisk ? 'risk' : 'clear'}`}>
      <div className="panel-heading">
        <div>
          <h2>合同履约总览</h2>
          <p>用于检查当前章节是否满足本章写作要求、事实约束和禁写规则。</p>
        </div>
        <div className="contract-fulfillment-actions">
          <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(summary.revisionPath)}>
            定位回修清单
          </button>
        </div>
      </div>
      <div className="contract-fulfillment-metrics">
        <article>
          <span>履约得分</span>
          <strong>{summary.score}</strong>
        </article>
        <article>
          <span>必须项</span>
          <strong>{summary.fulfilledRequiredCount}/{summary.requiredTotal}</strong>
        </article>
        <article className={summary.missingRequiredCount > 0 ? 'danger' : ''}>
          <span>缺失必须项</span>
          <strong>{summary.missingRequiredCount}</strong>
        </article>
        <article className={summary.touchedForbiddenCount > 0 ? 'danger' : ''}>
          <span>触碰禁写项</span>
          <strong>{summary.touchedForbiddenCount}</strong>
        </article>
        <article>
          <span>引用事实</span>
          <strong>{summary.referencedFactCount}</strong>
        </article>
      </div>
      <div className="contract-fulfillment-risks">
        <ContractFulfillmentList
          title="缺失必须项"
          items={summary.missingRequired}
          emptyText="暂无缺失必须项。"
          sourcePath={summary.contractPath}
          manuscriptPath={summary.manuscriptPath}
          onRevealProjectPath={props.onRevealProjectPath}
        />
        <ContractFulfillmentList
          title="触碰禁写项"
          items={summary.touchedForbidden}
          emptyText="暂无触碰禁写项。"
          sourcePath={summary.contractPath}
          manuscriptPath={summary.manuscriptPath}
          onRevealProjectPath={props.onRevealProjectPath}
        />
      </div>
    </section>
  )
}

function ContractFulfillmentList(props: {
  title: string
  items: string[]
  emptyText: string
  sourcePath: string
  manuscriptPath: string
  onRevealProjectPath: (relativePath: string) => void
}) {
  return (
    <article>
      <strong>{props.title}</strong>
      {props.items.length === 0 ? (
        <p>{props.emptyText}</p>
      ) : (
        <ul>
          {props.items.slice(0, 4).map((item) => (
            <li className="contract-fulfillment-risk-item" key={item}>
              <span>{item}</span>
              <span className="contract-fulfillment-risk-actions">
                <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(props.sourcePath)}>
                  定位合同
                </button>
                <button type="button" className="ghost-button" onClick={() => props.onRevealProjectPath(props.manuscriptPath)}>
                  定位正文
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {props.items.length > 4 && <small>还有 {props.items.length - 4} 项，请查看完整摘要。</small>}
    </article>
  )
}

export function LogsPanel(props: WorkspaceProps) {
  const isSystem = props.activeModuleView === 'logs-system-events'
  const files = props.markdownFiles.filter((file) => isSystem
    ? file.relative_path.startsWith('.olienta-events/') || file.relative_path === 'logs/system-events.jsonl'
    : file.relative_path === 'facts/author-confirmation.md')
  if (props.activeModuleView === 'logs-confirmations') {
    return <CandidateConfirmationAuditPanel {...props} />
  }

  return (
    <DocumentHubPanel
      title={isSystem ? '系统事件' : '作者确认日志'}
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

type CandidateConfirmationIndex = {
  chapter_id: string
  latest_confirmation_path: string
  entries: CandidateConfirmationIndexEntry[]
}

type CandidateConfirmationIndexEntry = {
  entry_id?: string
  created_at_ms: number
  adoption_status: string
  adoption_mode: string
  candidate_path: string
  current_candidate_manifest_path?: string
  candidate_history_manifest_path?: string
  manuscript_path: string
  confirmation_path: string
  latest_confirmation_path: string
}

type CandidateConfirmationIndexRecord = CandidateConfirmationIndexEntry & {
  chapterId: string
  path: string
  fromIndex: boolean
  bytes?: number
}

function CandidateConfirmationAuditPanel(props: WorkspaceProps) {
  const [chapterFilter, setChapterFilter] = useState('all')
  const [recordTypeFilter, setRecordTypeFilter] = useState('all')
  const [adoptionModeFilter, setAdoptionModeFilter] = useState('all')
  const [historyBindingFilter, setHistoryBindingFilter] = useState('all')
  const [confirmationQuery, setConfirmationQuery] = useState('')
  const [confirmationModeByPath, setConfirmationModeByPath] = useState<Record<string, string>>({})
  const [confirmationIndexByChapter, setConfirmationIndexByChapter] = useState<Record<string, CandidateConfirmationIndex>>({})
  const [includeLatestConfirmations, setIncludeLatestConfirmations] = useState(false)
  const confirmationIndexFiles = useMemo(
    () => props.markdownFiles
      .filter((file) => file.relative_path.startsWith('logs/confirmations/') && file.relative_path.endsWith('/index.json'))
      .sort((left, right) => left.relative_path.localeCompare(right.relative_path)),
    [props.markdownFiles],
  )
  const confirmationFiles = useMemo(
    () => props.markdownFiles
      .filter((file) => file.relative_path.startsWith('logs/confirmations/') && file.relative_path.endsWith('.md'))
      .sort((left, right) => right.relative_path.localeCompare(left.relative_path)),
    [props.markdownFiles],
  )
  const indexedConfirmationPaths = useMemo(
    () => new Set(Object.values(confirmationIndexByChapter).flatMap((index) => index.entries.map((entry) => entry.confirmation_path))),
    [confirmationIndexByChapter],
  )
  const confirmationRecords = useMemo(() => {
    const indexedRecords: CandidateConfirmationIndexRecord[] = Object.values(confirmationIndexByChapter)
      .flatMap((index) => index.entries.map((entry) => ({
        ...entry,
        chapterId: index.chapter_id,
        path: entry.confirmation_path,
        fromIndex: true,
      })))
    const fallbackRecords: CandidateConfirmationIndexRecord[] = confirmationFiles
      .filter((file) => includeLatestConfirmations || !isLatestConfirmationPath(file.relative_path))
      .filter((file) => !indexedConfirmationPaths.has(file.relative_path))
      .map((file) => ({
        created_at_ms: confirmationTimestampFromPath(file.relative_path),
        entry_id: undefined,
        adoption_status: confirmationRecordType(file.relative_path) === 'undo' ? 'undone' : 'adopted',
        adoption_mode: confirmationModeByPath[file.relative_path] || '',
        candidate_path: '',
        current_candidate_manifest_path: undefined,
        candidate_history_manifest_path: undefined,
        manuscript_path: '',
        confirmation_path: file.relative_path,
        latest_confirmation_path: latestConfirmationPathFor(file.relative_path),
        chapterId: confirmationChapterId(file.relative_path),
        path: file.relative_path,
        fromIndex: false,
        bytes: file.bytes,
      }))
    return [...indexedRecords, ...fallbackRecords]
      .filter((record) => includeLatestConfirmations || !isLatestConfirmationPath(record.path))
      .sort((left, right) => {
        const byTime = right.created_at_ms - left.created_at_ms
        return byTime || right.path.localeCompare(left.path)
      })
  }, [confirmationFiles, confirmationIndexByChapter, confirmationModeByPath, includeLatestConfirmations, indexedConfirmationPaths])
  const chapterOptions = useMemo(
    () => Array.from(new Set(confirmationRecords.map((record) => record.chapterId))).sort(),
    [confirmationRecords],
  )
  const adoptionModeOptions = useMemo(
    () => Array.from(new Set(confirmationRecords.map((record) => record.adoption_mode).filter(Boolean))).sort(),
    [confirmationRecords],
  )

  useEffect(() => {
    let cancelled = false

    async function loadConfirmationModes() {
      if (!props.project || !isTauriRuntime || confirmationFiles.length === 0) {
        setConfirmationModeByPath({})
        return
      }

      const entries = await Promise.all(
        confirmationFiles.map(async (file) => {
          try {
            const loaded = await tauriApi.loadProjectMarkdownFile(props.project!.root_path, file.relative_path)
            return [file.relative_path, parseConfirmationAdoptionMode(loaded.content)] as const
          } catch {
            return [file.relative_path, ''] as const
          }
        }),
      )

      if (!cancelled) {
        setConfirmationModeByPath(Object.fromEntries(entries))
      }
    }

    void loadConfirmationModes()
    return () => {
      cancelled = true
    }
  }, [confirmationFiles, props.project])

  useEffect(() => {
    let cancelled = false

    async function loadConfirmationIndexes() {
      if (!props.project || !isTauriRuntime || confirmationIndexFiles.length === 0) {
        setConfirmationIndexByChapter({})
        return
      }

      const entries = await Promise.all(
        confirmationIndexFiles.map(async (file) => {
          try {
            const loaded = await tauriApi.loadProjectMarkdownFile(props.project!.root_path, file.relative_path)
            const parsed = JSON.parse(loaded.content) as CandidateConfirmationIndex
            return [parsed.chapter_id || confirmationChapterId(file.relative_path), parsed] as const
          } catch {
            return null
          }
        }),
      )

      if (!cancelled) {
        setConfirmationIndexByChapter(Object.fromEntries(entries.filter((entry): entry is readonly [string, CandidateConfirmationIndex] => Boolean(entry))))
      }
    }

    void loadConfirmationIndexes()
    return () => {
      cancelled = true
    }
  }, [confirmationIndexFiles, props.project])

  const filteredConfirmationRecords = confirmationRecords.filter((record) => {
    const matchesChapter = chapterFilter === 'all' || record.chapterId === chapterFilter
    const matchesRecordType = recordTypeFilter === 'all' || confirmationRecordType(record.path) === recordTypeFilter
    const matchesAdoptionMode = adoptionModeFilter === 'all' || record.adoption_mode === adoptionModeFilter
    const matchesHistoryBinding =
      historyBindingFilter === 'all'
      || (historyBindingFilter === 'bound' && Boolean(record.candidate_history_manifest_path))
      || (historyBindingFilter === 'unbound' && !record.candidate_history_manifest_path)
    const searchable = [record.path, record.entry_id, record.candidate_path, record.current_candidate_manifest_path, record.candidate_history_manifest_path, record.manuscript_path, record.adoption_mode].join(' ').toLowerCase()
    const matchesQuery = !confirmationQuery.trim() || searchable.includes(confirmationQuery.trim().toLowerCase())
    return matchesChapter && matchesRecordType && matchesAdoptionMode && matchesHistoryBinding && matchesQuery
  })
  const adoptionCount = confirmationRecords.filter((record) => !isUndoConfirmationPath(record.path)).length
  const undoCount = confirmationRecords.length - adoptionCount
  const selectedPath = props.selectedMarkdownPath.startsWith('logs/confirmations/')
    ? props.selectedMarkdownPath
    : filteredConfirmationRecords[0]?.path ?? confirmationRecords[0]?.path ?? ''
  const selectedContent = props.selectedMarkdownPath === selectedPath ? props.markdownPreview : ''
  const activeHighlightedConfirmationPath = props.highlightedConfirmationPath
  const activeHighlightedConfirmationEntryId = props.highlightedConfirmationEntryId
  const activeHighlightedConfirmationLabel = activeHighlightedConfirmationEntryId || activeHighlightedConfirmationPath

  return (
    <section className="confirmation-audit-layout">
      <aside className="confirmation-audit-list">
        <div className="confirmation-audit-summary">
          <article>
            <span>确认摘要</span>
            <strong>{confirmationRecords.length}</strong>
          </article>
          <article>
            <span>采用</span>
            <strong>{adoptionCount}</strong>
          </article>
          <article>
            <span>撤销</span>
            <strong>{undoCount}</strong>
          </article>
        </div>
        <div className="confirmation-audit-filters">
          <label>
            <span>章节</span>
            <select value={chapterFilter} onChange={(event) => setChapterFilter(event.target.value)}>
              <option value="all">全部章节</option>
              {chapterOptions.map((chapterId) => (
                <option value={chapterId} key={chapterId}>第 {chapterId} 章</option>
              ))}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select value={recordTypeFilter} onChange={(event) => setRecordTypeFilter(event.target.value)}>
              <option value="all">全部类型</option>
              <option value="adopted">采用</option>
              <option value="undo">撤销</option>
            </select>
          </label>
          <label>
            <span>采用方式</span>
            <select value={adoptionModeFilter} onChange={(event) => setAdoptionModeFilter(event.target.value)}>
              <option value="all">全部方式</option>
              {adoptionModeOptions.map((mode) => (
                <option value={mode} key={mode}>{formatAdoptionMode(mode)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>历史归档</span>
            <select value={historyBindingFilter} onChange={(event) => setHistoryBindingFilter(event.target.value)}>
              <option value="all">全部归档状态</option>
              <option value="bound">已绑定历史版本</option>
              <option value="unbound">尚未归档历史版本</option>
            </select>
          </label>
          <label className="wide">
            <span>路径关键词</span>
            <input
              value={confirmationQuery}
              onChange={(event) => setConfirmationQuery(event.target.value)}
              placeholder="章节或摘要路径"
            />
          </label>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setChapterFilter('all')
              setRecordTypeFilter('all')
              setAdoptionModeFilter('all')
              setHistoryBindingFilter('all')
              setConfirmationQuery('')
            }}
          >
            清除筛选
          </button>
          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={includeLatestConfirmations}
              onChange={(event) => setIncludeLatestConfirmations(event.target.checked)}
            />
            <span>显示 latest 兼容文件</span>
          </label>
          <small>当前显示 {filteredConfirmationRecords.length} / {confirmationRecords.length} 条</small>
          {activeHighlightedConfirmationLabel && (
            <button type="button" className="ghost-button" onClick={props.onClearConfirmationHighlight}>
              清除确认高亮
            </button>
          )}
        </div>
        {activeHighlightedConfirmationLabel && (
          <p className="model-call-refresh-note">已高亮采用确认：{activeHighlightedConfirmationLabel}</p>
        )}
        {confirmationRecords.length === 0 && <p className="empty-note">暂时没有候选稿采用确认摘要。</p>}
        {confirmationRecords.length > 0 && filteredConfirmationRecords.length === 0 && (
          <p className="empty-note">没有匹配当前筛选条件的确认摘要。</p>
        )}
        {filteredConfirmationRecords.map((record) => {
          const undo = isUndoConfirmationPath(record.path)
          const highlighted = activeHighlightedConfirmationEntryId
            ? record.entry_id === activeHighlightedConfirmationEntryId
            : activeHighlightedConfirmationPath === record.path
          return (
            <article className={`confirmation-audit-card ${undo ? 'undo' : 'adopted'} ${selectedPath === record.path ? 'active' : ''} ${highlighted ? 'highlighted' : ''}`} key={record.path}>
              <button type="button" onClick={() => props.onLoadMarkdownFile(record.path)}>
                <span>{undo ? '撤销' : '采用'}</span>
                <strong>{formatConfirmationTitle(record.path)}</strong>
                {record.adoption_mode && (
                  <em>{formatAdoptionMode(record.adoption_mode)}</em>
                )}
                {record.fromIndex && <em>index</em>}
                {record.entry_id && <em>{record.entry_id}</em>}
                <small>{record.path}</small>
              </button>
              <button type="button" className="local-file-locate" onClick={() => props.onRevealProjectPath(record.path)}>
                定位
              </button>
              {record.current_candidate_manifest_path && (
                <button type="button" className="local-file-locate" onClick={() => props.onLoadMarkdownFile(record.current_candidate_manifest_path!)}>
                  定位候选稿 manifest
                </button>
              )}
              {record.candidate_history_manifest_path && (
                <button type="button" className="local-file-locate" onClick={() => props.onOpenCandidateHistoryVersion(record.candidate_history_manifest_path!, record.confirmation_path, record.entry_id)}>
                  定位候选稿历史版本
                </button>
              )}
            </article>
          )
        })}
      </aside>
      <MarkdownDocument
        title="采用确认摘要"
        path=""
        value={selectedContent}
        onChange={() => undefined}
        onSave={() => undefined}
        readOnly
        hideReadOnlyBadge
        hidePath
      />
    </section>
  )
}

export function ModelCallsPanel(props: WorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [taskFilter, setTaskFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [failureKindFilter, setFailureKindFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [providerTesting, setProviderTesting] = useState(false)
  const [providerBatchTesting, setProviderBatchTesting] = useState(false)
  const [testRefreshNote, setTestRefreshNote] = useState('')
  const [highlightedModelCallId, setHighlightedModelCallId] = useState('')
  const defaultPath = 'logs/model-calls/history.md'
  const entries = useMemo(() => parseModelCallHistory(props.markdownPreview), [props.markdownPreview])
  const summary = useMemo(() => summarizeModelCallHistory(props.markdownPreview), [props.markdownPreview])
  const parsedProviders = useMemo(() => parseProviders(props.aiProvidersJson), [props.aiProvidersJson])
  const pricingProviders = useMemo(() => parsedProviders.ok ? parsedProviders.providers : [], [parsedProviders])
  const costSummary = useMemo(() => summarizeModelCallCosts(entries, pricingProviders), [entries, pricingProviders])
  const failureSummary = useMemo(() => summarizeModelCallFailures(entries), [entries])
  const providerSummaries = useMemo(() => summarizeModelCallProviders(entries, pricingProviders), [entries, pricingProviders])
  const taskSummaries = useMemo(() => summarizeModelCallTasks(entries, pricingProviders), [entries, pricingProviders])
  const taskOptions = useMemo(() => Array.from(new Set(entries.map((entry) => entry.task))).sort(), [entries])
  const providerOptions = useMemo(() => Array.from(new Set(entries.map((entry) => entry.provider))).sort(), [entries])
  const failureKindOptions = useMemo(() => failureSummary.reasonGroups.map((group) => group.kind), [failureSummary])
  const activeHighlightedModelCallId = props.highlightedModelCallId || highlightedModelCallId
  const activeQuery = props.highlightedModelCallId || query
  const filteredEntries = useMemo(
    () => filterModelCallEntries(entries, { status: statusFilter, task: taskFilter, provider: providerFilter, failureKind: failureKindFilter, query: activeQuery }).slice().reverse(),
    [activeQuery, entries, failureKindFilter, providerFilter, statusFilter, taskFilter],
  )

  function clearModelCallFilters() {
    setStatusFilter('all')
    setTaskFilter('all')
    setProviderFilter('all')
    setFailureKindFilter('all')
    setQuery('')
    setHighlightedModelCallId('')
    props.onClearModelCallHighlight()
  }

  async function runProviderTestAndRefresh() {
    if (providerTesting) return

    setProviderTesting(true)
    setTestRefreshNote('正在运行 Provider 测试...')
    try {
      const result = await props.onTestAiProvider()
      props.onLoadMarkdownFile(defaultPath)
      clearModelCallFilters()
      setHighlightedModelCallId(result?.logEntryId ?? '')
      if (result?.ok === false) {
        setStatusFilter('failed')
        if (result.provider) setProviderFilter(result.provider)
      }
      setTestRefreshNote(result?.ok === false
        ? '测试完成，已刷新模型调用历史并筛到本次失败 Provider。'
        : '测试完成，已刷新模型调用历史；列表顶部显示最新记录。')
    } finally {
      setProviderTesting(false)
    }
  }

  async function runProviderBatchTestAndRefresh() {
    if (providerBatchTesting) return

    setProviderBatchTesting(true)
    setTestRefreshNote('正在批量测试所有启用 Provider...')
    try {
      const result = await props.onTestAiProviders()
      props.onLoadMarkdownFile(defaultPath)
      clearModelCallFilters()
      setTaskFilter('provider-test')
      if (result?.failed && result.failed > 0) {
        setStatusFilter('failed')
      }
      setHighlightedModelCallId(result?.results.at(-1)?.logEntryId ?? '')
      setTestRefreshNote(result
        ? `批量测试完成：${result.passed}/${result.total} 可用，${result.failed} 失败。`
        : '批量测试没有返回结果，请检查 Provider 配置。')
    } finally {
      setProviderBatchTesting(false)
    }
  }

  function drillIntoProvider(provider: string, status = 'all') {
    setProviderFilter(provider)
    setStatusFilter(status)
    setTaskFilter('all')
    setFailureKindFilter('all')
    setQuery('')
  }

  function drillIntoFailureKind(kind: string) {
    setFailureKindFilter(kind)
    setStatusFilter('failed')
    setTaskFilter('all')
    setProviderFilter('all')
    setQuery('')
  }

  if (props.activeModuleView === 'model-providers' || props.activeView === 'ai-providers') {
    return <ProviderPanel {...props} />
  }

  return (
    <section className="system-events-panel">
      <div className="provider-test-card">
        <span>Provider 测试</span>
        <strong>{props.providerTestMessage}</strong>
        <p>{props.aiProvidersPath}</p>
        <div className="editor-actions">
          <button type="button" className="ghost-button" onClick={() => void runProviderTestAndRefresh()} disabled={providerTesting}>
            {providerTesting ? '测试中' : '运行测试'}
          </button>
          <button type="button" className="ghost-button" onClick={() => void runProviderBatchTestAndRefresh()} disabled={providerBatchTesting}>
            {providerBatchTesting ? '批量测试中' : '批量测试'}
          </button>
          <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(defaultPath)}>打开历史</button>
          <button type="button" className="ghost-button" onClick={clearModelCallFilters}>最新记录</button>
        </div>
        {testRefreshNote && <p className="model-call-refresh-note">{testRefreshNote}</p>}
        {activeHighlightedModelCallId && <p className="model-call-refresh-note">已高亮模型调用记录：{activeHighlightedModelCallId}</p>}
      </div>
      <div className="health-strip">
        <article><span>调用次数</span><strong>{summary.callCount}</strong></article>
        <article><span>失败次数</span><strong>{summary.failedCount}</strong></article>
        <article><span>平均耗时</span><strong>{summary.averageDurationMs} ms</strong></article>
        <article><span>Token 总量</span><strong>{summary.totalTokens}</strong></article>
        <article><span>预估费用</span><strong>{formatUsd(costSummary.estimatedCostUsd)}</strong></article>
      </div>
      <section className="model-call-failure-panel">
        <div className="panel-heading">
          <h2>失败诊断</h2>
          <div className="model-call-panel-actions">
            <span>{failureSummary.totalFailed} 条失败调用</span>
            <button type="button" className="ghost-button" onClick={() => void runProviderTestAndRefresh()} disabled={providerTesting}>
              {providerTesting ? '测试中' : '运行测试'}
            </button>
            <button type="button" className="ghost-button" onClick={() => void runProviderBatchTestAndRefresh()} disabled={providerBatchTesting}>
              {providerBatchTesting ? '批量测试中' : '批量测试'}
            </button>
            <button type="button" className="ghost-button" onClick={props.onOpenModelProviders}>Provider 配置</button>
          </div>
        </div>
        {failureSummary.totalFailed === 0 ? (
          <p className="empty-note">当前模型调用日志里没有失败记录。</p>
        ) : (
          <div className="model-call-failure-grid">
            <div className="model-call-failure-column">
              <h3>失败 Provider</h3>
              {failureSummary.providerGroups.slice(0, 5).map((group) => (
                <button type="button" className="model-call-failure-card" key={group.provider} onClick={() => drillIntoProvider(group.provider, 'failed')}>
                  <div>
                    <strong>{group.provider}</strong>
                    <span>{group.tasks.join(' / ')}</span>
                  </div>
                  <b>{group.count}</b>
                  <p>{group.latestTask}：{group.latestMessage}</p>
                </button>
              ))}
            </div>
            <div className="model-call-failure-column">
              <h3>错误归因</h3>
              {failureSummary.reasonGroups.map((group) => (
                <button type="button" className="model-call-failure-card" key={group.kind} onClick={() => drillIntoFailureKind(group.kind)}>
                  <div>
                    <strong>{group.label}</strong>
                    <span>{group.latestProvider}</span>
                  </div>
                  <b>{group.count}</b>
                  <p>{group.advice}</p>
                  <small>{group.latestMessage}</small>
                </button>
              ))}
            </div>
            <div className="model-call-failure-column">
              <h3>最近失败</h3>
              {failureSummary.recentFailures.map((entry) => (
                <article className="model-call-failure-card compact" key={entry.id}>
                  <div>
                    <strong>{entry.task}</strong>
                    <span>{entry.provider}</span>
                  </div>
                  <p>{entry.message}</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="model-task-trends">
        <div className="panel-heading">
          <h2>用途趋势</h2>
          <span>{taskSummaries.length} 类调用</span>
        </div>
        {taskSummaries.length === 0 ? (
          <p className="empty-note">还没有可汇总的用途调用记录。</p>
        ) : (
          <div className="model-task-grid">
            {taskSummaries.map((task) => (
              <button type="button" className={`model-task-card ${taskFilter === task.task ? 'active' : ''}`} key={task.task} onClick={() => setTaskFilter(task.task)}>
                <div>
                  <strong>{task.task}</strong>
                  <span>{task.primaryProvider}</span>
                </div>
                <dl>
                  <div><dt>调用</dt><dd>{task.callCount}</dd></div>
                  <div><dt>失败率</dt><dd className={task.failedCount > 0 ? 'danger-text' : ''}>{task.failureRate}%</dd></div>
                  <div><dt>平均耗时</dt><dd>{task.averageDurationMs} ms</dd></div>
                  <div><dt>Token</dt><dd>{task.totalTokens}</dd></div>
                  <div><dt>费用</dt><dd>{formatUsd(task.estimatedCostUsd)}</dd></div>
                </dl>
                <p>{formatModelCallStatus(task.latestStatus)}：{task.latestMessage}</p>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="model-provider-diagnostics">
        <div className="panel-heading">
          <h2>Provider 诊断</h2>
          <span>{providerSummaries.length} 个 Provider</span>
        </div>
        {providerSummaries.length === 0 ? (
          <p className="empty-note">还没有可汇总的模型调用记录。</p>
        ) : (
          <div className="model-provider-table">
            <div className="model-provider-table-head">
              <span>Provider</span>
              <span>调用</span>
              <span>失败率</span>
              <span>平均耗时</span>
              <span>Token</span>
              <span>费用</span>
              <span>最近结果</span>
            </div>
            {providerSummaries.map((provider) => (
              <button type="button" className={`model-provider-row ${providerFilter === provider.provider ? 'active' : ''}`} key={provider.provider} onClick={() => drillIntoProvider(provider.provider)}>
                <div>
                  <strong>{provider.provider}</strong>
                  <span>{provider.tasks.join(' / ')}</span>
                </div>
                <b>{provider.callCount}</b>
                <b className={provider.failedCount > 0 ? 'danger-text' : ''}>{provider.failureRate}%</b>
                <span>{provider.averageDurationMs} ms</span>
                <span>{provider.totalTokens}</span>
                <span>{formatUsd(provider.estimatedCostUsd)}</span>
                <p>{formatModelCallStatus(provider.latestStatus)}：{provider.latestMessage}</p>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="model-call-browser">
        <div className="model-call-filters">
          <label>
            <span>状态</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">全部</option>
              <option value="ok">成功</option>
              <option value="failed">失败</option>
              <option value="unknown">未知</option>
            </select>
          </label>
          <label>
            <span>类型</span>
            <select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
              <option value="all">全部</option>
              {taskOptions.map((task) => <option value={task} key={task}>{task}</option>)}
            </select>
          </label>
          <label>
            <span>Provider</span>
            <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
              <option value="all">全部</option>
              {providerOptions.map((provider) => <option value={provider} key={provider}>{provider}</option>)}
            </select>
          </label>
          <label>
            <span>错误类型</span>
            <select value={failureKindFilter} onChange={(event) => setFailureKindFilter(event.target.value)}>
              <option value="all">全部</option>
              {failureKindOptions.map((kind) => <option value={kind} key={kind}>{formatFailureKind(kind)}</option>)}
            </select>
          </label>
          <label>
            <span>搜索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Provider、章节、路径或结果"
            />
          </label>
          <div className="model-call-filter-actions">
            <strong>{filteredEntries.length} 条</strong>
            <button type="button" className="ghost-button" onClick={() => setStatusFilter('failed')}>只看失败</button>
            <button type="button" className="ghost-button" onClick={clearModelCallFilters}>清除筛选</button>
          </div>
        </div>
        <div className="model-call-list">
          {filteredEntries.length === 0 ? (
            <p className="empty-note">没有匹配的模型调用记录。</p>
          ) : (
            filteredEntries.slice(0, 12).map((entry) => {
              const estimatedCost = estimateModelCallCost(entry, pricingProviders)
              const failure = classifyModelCallFailure(entry)
              const highlighted = activeHighlightedModelCallId === entry.logEntryId
              return (
              <article className={`model-call-row ${entry.status} ${highlighted ? 'highlighted' : ''}`} key={entry.id}>
                <div className="model-call-row-head">
                  <div>
                    <strong>{entry.task}</strong>
                    <span>{entry.provider}</span>
                  </div>
                  <span className={`status-pill ${entry.status === 'ok' ? 'unlocked' : entry.status === 'failed' ? 'locked' : ''}`}>
                    {formatModelCallStatus(entry.status)}
                  </span>
                </div>
                <dl>
                  <div><dt>章节</dt><dd>{entry.chapter}</dd></div>
                  <div><dt>耗时</dt><dd>{entry.durationMs === null ? '-' : `${entry.durationMs} ms`}</dd></div>
                  <div><dt>重试</dt><dd>{entry.retryAttempts > 0 ? `${entry.retryAttempts} 次` : '-'}</dd></div>
                  <div><dt>重试原因</dt><dd>{entry.retryReason}</dd></div>
                  <div><dt>尝试耗时</dt><dd>{entry.attemptDurationsMs}</dd></div>
                  <div><dt>Token</dt><dd>{entry.totalTokens ?? '-'}</dd></div>
                  <div><dt>费用</dt><dd>{estimatedCost === null ? '-' : formatUsd(estimatedCost)}</dd></div>
                  <div><dt>错误</dt><dd>{entry.status === 'failed' ? failure.label : '-'}</dd></div>
                  <div><dt>输出</dt><dd>{entry.output}</dd></div>
                </dl>
                {entry.promptSummary !== '-' && (
                  <p className="model-call-prompt-summary">
                    <span>Prompt 摘要</span>
                    {entry.promptSummary}
                  </p>
                )}
                <p>{entry.message}</p>
                {entry.status === 'failed' && (
                  <div className="model-call-advice">
                    <p>{failure.advice}</p>
                    <div className="editor-actions">
                      <button type="button" className="ghost-button" onClick={() => void runProviderTestAndRefresh()} disabled={providerTesting}>
                        {providerTesting ? '测试中' : '运行测试'}
                      </button>
                      <button type="button" className="ghost-button" onClick={props.onOpenModelProviders}>Provider 配置</button>
                    </div>
                  </div>
                )}
              </article>
              )
            })
          )}
        </div>
      </section>
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

function formatModelCallStatus(status: string) {
  const labels: Record<string, string> = {
    ok: '成功',
    failed: '失败',
    unknown: '未知',
  }
  return labels[status] || status
}

function formatFailureKind(kind: string) {
  const labels: Record<string, string> = {
    auth: '鉴权',
    quota: '配额',
    'rate-limit': '限流',
    timeout: '超时',
    network: '网络',
    'response-format': '返回格式',
    provider: 'Provider',
    unknown: '未知',
  }
  return labels[kind] || kind
}

function formatUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.0000'
  if (value < 0.0001) return '<$0.0001'
  return `$${value.toFixed(4)}`
}

export function ExportPanel(props: WorkspaceProps) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>导出</h2></div>
      <ExportPanelActions {...props} />
      {props.lastExportedPath && <p className="empty-note">最近导出：{props.lastExportedPath}</p>}
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
  const selectedFile = props.files.find((file) => file.relative_path === props.selectedPath) ?? props.files[0]
  const path = selectedFile?.relative_path || ''
  const readableContent = formatDocumentHubContent(path, props.content)

  useEffect(() => {
    if (selectedFile && props.selectedPath !== selectedFile.relative_path) {
      props.onLoad(selectedFile.relative_path)
    }
  }, [props, selectedFile])

  return (
    <section className="module-document-layout">
      <div className="module-document-list">
        {props.files.length === 0 && <p className="empty-note">暂时没有匹配的本地文件。</p>}
        {props.files.map((file) => (
          <div className="local-file-row local-file-row-with-action" key={file.relative_path}>
            <button type="button" className="local-file-open" onClick={() => props.onLoad(file.relative_path)}>
              <strong>{formatLogFileTitle(file.relative_path)}</strong>
              <span>{formatLogFileSubtitle(file.relative_path, file.bytes)}</span>
            </button>
            <button type="button" className="local-file-locate" onClick={() => props.onReveal(file.relative_path)}>
              定位
            </button>
          </div>
        ))}
      </div>
      <MarkdownDocument
        title={props.title}
        path=""
        value={readableContent}
        onChange={() => undefined}
        onSave={() => undefined}
        readOnly
        hideReadOnlyBadge
        hidePath
      />
    </section>
  )
}

function formatDocumentHubContent(path: string, content: string) {
  if (!content.trim()) return '暂无内容。'
  if (path.endsWith('.jsonl')) return formatJsonLogForAuthors(content, 'system')
  if (path.endsWith('.json')) return formatSingleJsonForAuthors(path, content)
  return content
}

function formatJsonLogForAuthors(content: string, kind: 'task' | 'system') {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return '暂无记录。'

  const entries = lines.slice(-80).map((line, index) => {
    try {
      return formatLogObject(JSON.parse(line), kind, index + 1)
    } catch {
      return `- ${line}`
    }
  })
  return `# ${kind === 'task' ? '任务历史' : '系统事件'}\n\n${entries.join('\n')}`
}

function formatSingleJsonForAuthors(path: string, content: string) {
  try {
    const parsed = JSON.parse(content)
    return `# ${formatLogFileTitle(path)}\n\n${formatLogObject(parsed, 'system', 1)}`
  } catch {
    return content
  }
}

function formatLogObject(entry: Record<string, unknown>, kind: 'task' | 'system', index: number) {
  const time = formatLogTime(entry.createdAtUnix) || formatLogTime(entry.created_at_unix) || formatLogTime(entry.created_at_ms, true) || `记录 ${index}`
  const status = typeof entry.status === 'string' ? formatTaskStatusLabel(entry.status) : ''
  const eventKind = typeof entry.kind === 'string' ? formatEventKind(entry.kind) : kind === 'task' ? '任务记录' : '系统记录'
  const detail = typeof entry.detail === 'object' && entry.detail !== null ? entry.detail as Record<string, unknown> : {}
  const chapter = typeof entry.chapterId === 'string' ? entry.chapterId : typeof detail.chapterId === 'string' ? detail.chapterId : ''
  const message = typeof detail.message === 'string'
    ? detail.message
    : typeof entry.message === 'string'
      ? entry.message
      : summarizeLogDetail(detail)
  const chapterText = chapter ? ` · 第 ${Number(chapter)} 章` : ''
  const statusText = status ? ` · ${status}` : ''
  return `- **${time}** · ${eventKind}${chapterText}${statusText}${message ? `：${message}` : ''}`
}

function summarizeLogDetail(detail: Record<string, unknown>) {
  const path = typeof detail.path === 'string' ? detail.path : typeof detail.configPath === 'string' ? detail.configPath : ''
  const count = typeof detail.count === 'number' ? detail.count : undefined
  const enabledCount = typeof detail.enabledCount === 'number' ? detail.enabledCount : undefined
  if (typeof detail.format === 'string') return `导出 ${detail.format}${path ? ` 到 ${formatFriendlyPath(path)}` : ''}`
  if (enabledCount !== undefined && count !== undefined) return `保存 ${enabledCount}/${count} 个可用配置`
  if (path) return formatFriendlyPath(path)
  return ''
}

function formatLogFileTitle(path: string) {
  if (path === 'facts/author-confirmation.md') return '作者确认记录'
  if (path === 'logs/system-events.jsonl') return '系统事件汇总'
  const commit = path.match(/\.olienta-events\/commits\/(\d+)-(\d+)\.json$/)
  if (commit) return `第 ${Number(commit[2])} 章保存记录`
  return fileNameWithoutExtension(path)
}

function formatLogFileSubtitle(path: string, bytes: number) {
  const commit = path.match(/\.olienta-events\/commits\/(\d+)-(\d+)\.json$/)
  if (commit) return `${formatLogTime(Number(commit[1]))} · ${formatBytes(bytes)}`
  return `${formatFriendlyPath(path)} · ${formatBytes(bytes)}`
}

function formatFriendlyPath(path: string) {
  if (path.includes('ai-providers')) return 'AI 设置'
  if (path.startsWith('manuscript/chapters/')) return `正文第 ${Number(fileNameWithoutExtension(path))} 章`
  if (path.startsWith('blueprints/chapters/')) return `蓝图第 ${Number(fileNameWithoutExtension(path))} 章`
  if (path.startsWith('tasks/writing-briefs/')) return `第 ${Number(fileNameWithoutExtension(path))} 章写作要求`
  if (path.startsWith('story-contracts/fulfillment/')) return `第 ${Number(fileNameWithoutExtension(path))} 章履约摘要`
  return path
}

function formatLogTime(value: unknown, milliseconds = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return ''
  const date = new Date(milliseconds ? value : value * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEventKind(kind: string) {
  const labels: Record<string, string> = {
    chapter_saved: '正文保存',
    candidate_generated: '候选稿生成',
    candidate_adopted: '候选稿采用',
    candidate_undo: '撤销采用',
    blueprint_saved: '蓝图保存',
    brief_composed: '写作要求生成',
    providers_saved: 'AI 设置保存',
    provider_tested: 'Provider 测试',
    export_created: '导出完成',
  }
  return labels[kind] || kind.replace(/_/g, ' ')
}

function formatTaskStatusLabel(status: string) {
  const labels: Record<string, string> = {
    done: '完成',
    working: '进行中',
    ready: '待处理',
    error: '失败',
    failed: '失败',
    ok: '成功',
  }
  return labels[status] || status
}

function ProviderPanel(props: WorkspaceProps) {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const parsed = parseProviders(props.aiProvidersJson)
  const providers = parsed.ok ? parsed.providers : []
  const ui = providerPanelCopy(props.locale)

  function updateProviders(nextProviders: AiProviderDraft[]) {
    setSaveState('idle')
    props.onChangeAiProvidersJson(`${JSON.stringify(nextProviders, null, 2)}\n`)
  }

  function updateProvider(index: number, patch: Partial<AiProviderDraft>) {
    updateProviders(providers.map((provider, providerIndex) =>
      providerIndex === index ? { ...provider, ...patch } : provider,
    ))
  }

  function moveProvider(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= providers.length) return
    const next = [...providers]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    updateProviders(next)
  }

  function addProvider() {
    updateProviders([
      ...providers,
      {
        id: `provider-${providers.length + 1}`,
        name: ui.newProviderName,
        kind: 'openai-compatible',
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: '',
        models: [''],
        contextWindow: 128000,
        temperature: 0.7,
        maxTokens: 4096,
        timeoutSeconds: 180,
        inputPricePerMillionTokens: 0,
        outputPricePerMillionTokens: 0,
        useCases: [],
      },
    ])
  }

  function duplicateProvider(index: number) {
    const provider = providers[index]
    updateProviders([
      ...providers.slice(0, index + 1),
      { ...provider, id: `${provider.id || 'provider'}-copy`, name: `${provider.name || 'Provider'} ${ui.copySuffix}` },
      ...providers.slice(index + 1),
    ])
  }

  function deleteProvider(index: number) {
    updateProviders(providers.filter((_, providerIndex) => providerIndex !== index))
  }

  function updateProviderModel(index: number, modelIndex: number, value: string) {
    const provider = providers[index]
    const models = providerModels(provider)
    const nextModels = models.map((model, currentIndex) => currentIndex === modelIndex ? value : model)
    updateProvider(index, { models: nextModels, model: nextModels[0] ?? '' })
  }

  function addProviderModel(index: number) {
    const provider = providers[index]
    const nextModels = [...providerModels(provider), '']
    updateProvider(index, { models: nextModels, model: nextModels[0] ?? '' })
  }

  function removeProviderModel(index: number, modelIndex: number) {
    const provider = providers[index]
    const nextModels = providerModels(provider).filter((_, currentIndex) => currentIndex !== modelIndex)
    const safeModels = nextModels.length > 0 ? nextModels : ['']
    updateProvider(index, { models: safeModels, model: safeModels[0] ?? '' })
  }

  async function saveProviders() {
    setSaveState('saving')
    const ok = await props.onSaveAiProviders()
    setSaveState(ok ? 'saved' : 'failed')
  }

  return (
    <section className="provider-workspace">
      <section className="provider-overview">
        <div className="card-heading">
          <div>
            <h2>{ui.title}</h2>
            <p>{ui.description}</p>
          </div>
          <div className="editor-actions">
            <button type="button" className="ghost-button" onClick={addProvider} disabled={!parsed.ok}>{ui.add}</button>
            <button type="button" className="primary-button" onClick={() => void saveProviders()} disabled={!parsed.ok || saveState === 'saving'}>
              {saveState === 'saving' ? ui.saving : ui.save}
            </button>
            <button type="button" className="ghost-button" onClick={props.onTestAiProvider}>{ui.test}</button>
            <span className="status-pill">
              {saveState === 'saved'
                ? props.providerTestMessage || ui.saved
                : saveState === 'failed'
                  ? props.providerTestMessage || ui.saveFailed
                  : props.providerTestMessage}
            </span>
          </div>
        </div>
        {!parsed.ok && <p className="empty-note danger">{ui.parseFailed}: {parsed.message}</p>}
        {parsed.ok && <p className="empty-note">{ui.securityNote}</p>}
        {parsed.ok && (
          <section className="provider-list-summary" aria-label={ui.configuredApis}>
            <div className="section-title-row">
              <div>
                <h3>{ui.configuredApis}</h3>
                <p>{ui.providerListDescription}</p>
              </div>
              <strong>{providers.filter((provider) => provider.enabled !== false).length}/{providers.length} {ui.available}</strong>
            </div>
            {providers.length === 0 ? (
              <p className="empty-note">{ui.emptyProviders}</p>
            ) : (
              <div className="provider-list-rows">
                {providers.map((provider, index) => (
                  <article key={`${provider.id}-${index}`}>
                    <span className={provider.enabled === false ? 'muted' : 'ready'}>
                      {provider.enabled === false ? ui.disabled : ui.enabled}
                    </span>
                    <div>
                      <strong>{provider.name || provider.id || `Provider ${index + 1}`}</strong>
                      <small>{provider.model || ui.modelMissing} / {provider.baseUrl || ui.baseUrlMissing}</small>
                    </div>
                    <em>{providerKeyStatus(provider, props.locale)}</em>
                    <small>{provider.useCases.length === 0 ? ui.allWritingTasks : ui.customTasks}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        <div className="provider-author-summary">
          <article>
            <span>{ui.currentStatus}</span>
            <strong>{props.providerTestMessage || ui.notTested}</strong>
          </article>
          <article>
            <span>{ui.defaultModel}</span>
            <strong>{providers.find((provider) => provider.enabled !== false)?.model || ui.notConfigured}</strong>
          </article>
          <article>
            <span>{ui.scope}</span>
            <strong>{ui.globalScope}</strong>
          </article>
        </div>
        {parsed.ok && (
          <>
            <div className="provider-grid">
              {providers.map((provider, index) => (
                <article className={`provider-card ${provider.enabled === false ? 'disabled' : ''}`} key={`${provider.id}-${index}`}>
                  <div className="provider-card-header">
                    <div>
                      <h3>{provider.name || provider.id || `Provider ${index + 1}`}</h3>
                      <p>{provider.kind || 'openai-compatible'} / {provider.model || ui.modelMissing}</p>
                    </div>
                    <div className="editor-actions">
                      <button type="button" className="ghost-button" onClick={() => moveProvider(index, -1)} disabled={index === 0}>{ui.moveUp}</button>
                      <button type="button" className="ghost-button" onClick={() => moveProvider(index, 1)} disabled={index === providers.length - 1}>{ui.moveDown}</button>
                      <button type="button" className="ghost-button" onClick={() => duplicateProvider(index)}>{ui.copy}</button>
                      <button type="button" className="ghost-button danger" onClick={() => deleteProvider(index)}>{ui.delete}</button>
                    </div>
                  </div>
                  <div className="provider-settings">
                    <label className="switch-row">
                      <input
                        type="checkbox"
                        checked={provider.enabled !== false}
                        onChange={(event) => updateProvider(index, { enabled: event.target.checked })}
                      />
                      <span>{ui.enable}</span>
                    </label>
                    <label>
                      <span>{ui.name}</span>
                      <input value={provider.name} onChange={(event) => updateProvider(index, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>{ui.type}</span>
                      <select value={provider.kind} onChange={(event) => updateProvider(index, { kind: event.target.value })}>
                        {PROVIDER_KIND_OPTIONS.map((option) => (
                          <option value={option.value} key={option.value}>
                            {props.locale === 'en-US' ? option.en : option.zh}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Base URL</span>
                      <input value={provider.baseUrl} onChange={(event) => updateProvider(index, { baseUrl: event.target.value })} />
                    </label>
                    <label>
                      <span>API Key</span>
                      <input
                        type="password"
                        value={provider.apiKey ?? ''}
                        placeholder={ui.apiKeyPlaceholder}
                        onChange={(event) => updateProvider(index, { apiKey: event.target.value })}
                      />
                    </label>
                    <div className="provider-model-list">
                      <div className="provider-model-list-heading">
                        <span>{ui.models}</span>
                        <button type="button" className="ghost-button" onClick={() => addProviderModel(index)}>{ui.addModel}</button>
                      </div>
                      {providerModels(provider).map((model, modelIndex) => (
                        <label className="provider-model-row" key={`${provider.id}-${modelIndex}`}>
                          <span>{modelIndex === 0 ? ui.defaultModel : `${ui.model} ${modelIndex + 1}`}</span>
                          <input
                            value={model}
                            placeholder={modelIndex === 0 ? ui.defaultModelPlaceholder : ui.modelPlaceholder}
                            onChange={(event) => updateProviderModel(index, modelIndex, event.target.value)}
                          />
                          {modelIndex > 0 && (
                            <button type="button" className="ghost-button danger" onClick={() => removeProviderModel(index, modelIndex)}>
                              {ui.removeModel}
                            </button>
                          )}
                        </label>
                      ))}
                    </div>
                    <label>
                      <span>{ui.contextWindow}</span>
                      <input
                        type="number"
                        step="1000"
                        min="0"
                        value={provider.contextWindow ?? 0}
                        onChange={(event) => updateProvider(index, { contextWindow: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>{ui.temperature}</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={provider.temperature ?? 0.7}
                        onChange={(event) => updateProvider(index, { temperature: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>{ui.maxOutput}</span>
                      <input
                        type="number"
                        step="256"
                        min="0"
                        value={provider.maxTokens ?? 0}
                        onChange={(event) => updateProvider(index, { maxTokens: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>{ui.timeoutSeconds}</span>
                      <input
                        type="number"
                        step="5"
                        min="5"
                        max="300"
                        value={provider.timeoutSeconds ?? 180}
                        onChange={(event) => updateProvider(index, { timeoutSeconds: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  )
}

function ExportPanelActions(props: WorkspaceProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedChapters = props.chapters.filter((chapter) => selectedIds.includes(chapter.id))

  function toggleChapter(chapterId: string) {
    setSelectedIds((current) =>
      current.includes(chapterId)
        ? current.filter((id) => id !== chapterId)
        : [...current, chapterId],
    )
  }

  function exportSelected(format: 'markdown' | 'txt' | 'docx') {
    props.onExportProject(
      format,
      'selected',
      selectedChapters.map((chapter) => chapter.id),
    )
  }

  return (
    <section className="export-workspace">
      <div className="export-action-grid">
        <article>
          <span>全书</span>
          <strong>全部已确认章节</strong>
          <div className="editor-actions">
            <button className="ghost-button" onClick={() => props.onExportProject('markdown', 'all')}>MD</button>
            <button className="ghost-button" onClick={() => props.onExportProject('txt', 'all')}>TXT</button>
            <button className="ghost-button" onClick={() => props.onExportProject('docx', 'all')}>DOCX</button>
          </div>
        </article>
        <article>
          <span>当前章</span>
          <strong>{props.currentChapter.title}</strong>
          <div className="editor-actions">
            <button className="ghost-button" onClick={() => props.onExportProject('markdown', 'chapter')}>MD</button>
            <button className="ghost-button" onClick={() => props.onExportProject('txt', 'chapter')}>TXT</button>
            <button className="ghost-button" onClick={() => props.onExportProject('docx', 'chapter')}>DOCX</button>
          </div>
        </article>
        <article>
          <span>选中章节</span>
          <strong>{selectedIds.length} 章</strong>
          <div className="editor-actions">
            <button className="ghost-button" disabled={selectedIds.length === 0} onClick={() => exportSelected('markdown')}>MD</button>
            <button className="ghost-button" disabled={selectedIds.length === 0} onClick={() => exportSelected('txt')}>TXT</button>
            <button className="ghost-button" disabled={selectedIds.length === 0} onClick={() => exportSelected('docx')}>DOCX</button>
          </div>
        </article>
      </div>
      <div className="export-chapter-list">
        {props.chapters.map((chapter) => (
          <label key={chapter.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(chapter.id)}
              onChange={() => toggleChapter(chapter.id)}
            />
            <span>{chapter.id}</span>
            <strong>{chapter.title}</strong>
            <small>{chapter.words} 字 · {chapter.state}</small>
          </label>
        ))}
      </div>
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

type AiProviderDraft = {
  id: string
  name: string
  kind: string
  enabled: boolean
  baseUrl: string
  apiKey?: string
  model: string
  models?: string[]
  contextWindow?: number
  temperature?: number
  maxTokens?: number
  timeoutSeconds?: number
  inputPricePerMillionTokens?: number
  outputPricePerMillionTokens?: number
  useCases: string[]
  [key: string]: unknown
}

const PROVIDER_KIND_OPTIONS = [
  { value: 'openai-compatible', zh: 'OpenAI 兼容', en: 'OpenAI-compatible' },
  { value: 'anthropic', zh: 'Anthropic', en: 'Anthropic' },
  { value: 'custom', zh: '自定义', en: 'Custom' },
]

function parseProviders(content: string): { ok: true; providers: AiProviderDraft[] } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!Array.isArray(parsed)) {
      return { ok: false, message: '顶层必须是 Provider 数组。' }
    }
    return {
      ok: true,
      providers: parsed.map((item, index) => normalizeProviderDraft(item, index)),
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function normalizeProviderDraft(item: unknown, index: number): AiProviderDraft {
  const value = isRecord(item) ? item : {}
  const useCases = Array.isArray(value.useCases)
    ? value.useCases.filter((useCase): useCase is string => typeof useCase === 'string')
    : []
  const models = Array.isArray(value.models)
    ? value.models.filter((model): model is string => typeof model === 'string')
    : []
  const model = typeof value.model === 'string' ? value.model : models[0] ?? ''
  return {
    ...value,
    id: typeof value.id === 'string' ? value.id : `provider-${index + 1}`,
    name: typeof value.name === 'string' ? value.name : `Provider ${index + 1}`,
    kind: typeof value.kind === 'string' ? value.kind : 'openai-compatible',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    model,
    models: models.length > 0 ? models : [model],
    contextWindow: typeof value.contextWindow === 'number' ? value.contextWindow : 0,
    temperature: typeof value.temperature === 'number' ? value.temperature : 0.7,
    maxTokens: typeof value.maxTokens === 'number' ? value.maxTokens : 0,
    timeoutSeconds: typeof value.timeoutSeconds === 'number' ? value.timeoutSeconds : 180,
    inputPricePerMillionTokens: typeof value.inputPricePerMillionTokens === 'number' ? value.inputPricePerMillionTokens : 0,
    outputPricePerMillionTokens: typeof value.outputPricePerMillionTokens === 'number' ? value.outputPricePerMillionTokens : 0,
    useCases,
  }
}

function providerKeyStatus(provider: AiProviderDraft, locale: WorkspaceProps['locale']) {
  if (typeof provider.apiKey === 'string' && provider.apiKey.trim()) {
    return locale === 'en-US' ? 'Key entered' : 'Key 已填'
  }
  if (typeof provider.apiKeyEncrypted === 'string' && provider.apiKeyEncrypted.trim()) {
    return locale === 'en-US' ? 'Key saved locally' : 'Key 已本地保存'
  }
  return locale === 'en-US' ? 'API Key missing' : '缺 API Key'
}

function providerModels(provider: AiProviderDraft) {
  if (Array.isArray(provider.models) && provider.models.length > 0) return provider.models
  return [provider.model ?? '']
}

function providerPanelCopy(locale: WorkspaceProps['locale']) {
  if (locale === 'en-US') {
    return {
      title: 'AI API Settings',
      description: 'Connect one available AI model and Olienta will use it across writing, outlining, facts, and chapter drafts.',
      add: 'Add',
      save: 'Save',
      saving: 'Saving',
      test: 'Test',
      saved: 'Saved to app settings',
      saveFailed: 'Save failed',
      parseFailed: 'Provider JSON could not be parsed',
      securityNote: 'API Keys are saved in local app settings and are not written into project manuscripts or materials.',
      configuredApis: 'Configured APIs',
      providerListDescription: 'The first enabled API is used by default. Move providers up or down to change priority.',
      available: 'available',
      emptyProviders: 'No API yet. Click Add, then fill in the API Key and model.',
      disabled: 'Disabled',
      enabled: 'Enabled',
      modelMissing: 'Model not set',
      baseUrlMissing: 'Base URL not set',
      allWritingTasks: 'All writing tasks',
      customTasks: 'Custom tasks',
      currentStatus: 'Status',
      notTested: 'Not tested yet',
      defaultModel: 'Default model',
      notConfigured: 'Not configured',
      scope: 'Scope',
      globalScope: 'Available to the whole app',
      moveUp: 'Up',
      moveDown: 'Down',
      copy: 'Copy',
      delete: 'Delete',
      enable: 'Enable',
      name: 'Name',
      type: 'Type',
      apiKeyPlaceholder: 'Paste and save. The key is stored locally.',
      model: 'Model',
      models: 'Models',
      addModel: 'Add model',
      removeModel: 'Remove',
      defaultModelPlaceholder: 'Default model, e.g. deepseek-v4-pro',
      modelPlaceholder: 'Another model, e.g. deepseek-v4-flash',
      contextWindow: 'Context window',
      temperature: 'Temperature',
      maxOutput: 'Max output',
      timeoutSeconds: 'Timeout seconds',
      newProviderName: 'New Provider',
      copySuffix: 'Copy',
    }
  }
  return {
    title: 'AI API 设置',
    description: '接入一个可用模型后，Olienta 会在写作、蓝图、事实抽取和候选稿中全局使用它。',
    add: '新增',
    save: '保存',
    saving: '保存中',
    test: '测试',
    saved: '已保存到软件设置',
    saveFailed: '保存失败',
    parseFailed: 'Provider JSON 无法解析',
    securityNote: 'API Key 只保存到本机软件设置中，不会写入小说正文或资料文件。',
    configuredApis: '已配置 API',
    providerListDescription: '默认使用第一个启用的 API；上移、下移可以调整优先级。',
    available: '可用',
    emptyProviders: '还没有 API。点击“新增”后填入 API Key 和模型。',
    disabled: '停用',
    enabled: '启用',
    modelMissing: '未设置模型',
    baseUrlMissing: '未设置 Base URL',
    allWritingTasks: '全部写作任务',
    customTasks: '自定义任务',
    currentStatus: '当前状态',
    notTested: '尚未测试',
    defaultModel: '默认模型',
    notConfigured: '未设置',
    scope: '使用范围',
    globalScope: '全软件可用',
    moveUp: '上移',
    moveDown: '下移',
    copy: '复制',
    delete: '删除',
    enable: '启用',
    name: '名称',
    type: '类型',
    apiKeyPlaceholder: '粘贴后保存，密钥只保存在本机',
    model: '模型',
    models: '模型',
    addModel: '增加模型',
    removeModel: '移除',
    defaultModelPlaceholder: '默认模型，如 deepseek-v4-pro',
    modelPlaceholder: '其它模型，如 deepseek-v4-flash',
    contextWindow: '上下文窗口',
    temperature: '温度',
    maxOutput: '最大输出',
    timeoutSeconds: '超时秒数',
    newProviderName: '新 Provider',
    copySuffix: '副本',
  }
}

function numberOrUndefined(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

function isUndoConfirmationPath(path: string) {
  return /\/undo-\d+\.md$/.test(path) || /\/[^/]+-undo-\d+\.md$/.test(path)
}

function confirmationRecordType(path: string) {
  return isUndoConfirmationPath(path) ? 'undo' : 'adopted'
}

function confirmationChapterId(path: string) {
  const parts = path.split('/')
  const fileName = parts.pop()?.replace(/\.md$/, '') ?? path
  const parent = parts.at(-1)
  if (parent && parts.at(-2) === 'confirmations') return parent
  const undoMatch = /^(.*)-undo-\d+$/.exec(fileName)
  return undoMatch ? undoMatch[1] : fileName
}

function isLatestConfirmationPath(path: string) {
  return /^logs\/confirmations\/[^/]+\.md$/.test(path)
}

function confirmationTimestampFromPath(path: string) {
  const match = /\/(?:v|undo-)(\d+)\.md$/.exec(path)
  return match ? Number(match[1]) : 0
}

function latestConfirmationPathFor(path: string) {
  return `logs/confirmations/${confirmationChapterId(path)}.md`
}

function parseConfirmationAdoptionMode(content: string) {
  const match = content.match(/-\s*(?:采用方式|mode|adoption mode)\s*[:：]\s*([^\n\r]+)/i)
  return match?.[1]?.trim() ?? ''
}

function formatAdoptionMode(mode: string) {
  const labels: Record<string, string> = {
    replace: '替换正文',
    append: '追加到正文',
    insert: '插入光标',
    'replace-paragraph': '替换正文段',
    'undo-replace-paragraph': '撤销段落替换',
  }
  return labels[mode] || mode
}

function formatConfirmationTitle(path: string) {
  const chapterId = confirmationChapterId(path)
  return isUndoConfirmationPath(path)
    ? `Chapter ${chapterId} undo confirmation`
    : `Chapter ${chapterId} adoption confirmation`
}

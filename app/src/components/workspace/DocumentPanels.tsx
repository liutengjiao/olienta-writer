import { useMemo, useRef, useState } from 'react'
import type { MarkdownFileSummary, PinnedContextItem, TaskItem } from '../../types'
import type { WorkspaceProps } from './types'
import { ChapterList, MarkdownDocument } from './EditorPanels'
import { buildProviderExportJson } from '../../lib/providerLogic'
import { classifyModelCallFailure, estimateModelCallCost, filterModelCallEntries, parseModelCallHistory, summarizeModelCallCosts, summarizeModelCallFailures, summarizeModelCallHistory, summarizeModelCallProviders } from '../../lib/modelCallLogic'

export function LocalFilesPanel(props: WorkspaceProps) {
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

export function SkillPanel(props: WorkspaceProps) {
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
        path={props.selectedSkillName || 'skills/selected'}
        value={props.skillPreview}
        onChange={() => undefined}
        onSave={() => undefined}
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
      <p className="empty-note">{props.candidateGenerationStatus}</p>
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

export function LogsPanel(props: WorkspaceProps) {
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

export function ModelCallsPanel(props: WorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [taskFilter, setTaskFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [failureKindFilter, setFailureKindFilter] = useState('all')
  const [query, setQuery] = useState('')
  const defaultPath = 'logs/model-calls/history.md'
  const entries = useMemo(() => parseModelCallHistory(props.markdownPreview), [props.markdownPreview])
  const summary = useMemo(() => summarizeModelCallHistory(props.markdownPreview), [props.markdownPreview])
  const parsedProviders = useMemo(() => parseProviders(props.aiProvidersJson), [props.aiProvidersJson])
  const pricingProviders = useMemo(() => parsedProviders.ok ? parsedProviders.providers : [], [parsedProviders])
  const costSummary = useMemo(() => summarizeModelCallCosts(entries, pricingProviders), [entries, pricingProviders])
  const failureSummary = useMemo(() => summarizeModelCallFailures(entries), [entries])
  const providerSummaries = useMemo(() => summarizeModelCallProviders(entries, pricingProviders), [entries, pricingProviders])
  const taskOptions = useMemo(() => Array.from(new Set(entries.map((entry) => entry.task))).sort(), [entries])
  const providerOptions = useMemo(() => Array.from(new Set(entries.map((entry) => entry.provider))).sort(), [entries])
  const failureKindOptions = useMemo(() => failureSummary.reasonGroups.map((group) => group.kind), [failureSummary])
  const filteredEntries = useMemo(
    () => filterModelCallEntries(entries, { status: statusFilter, task: taskFilter, provider: providerFilter, failureKind: failureKindFilter, query }).slice().reverse(),
    [entries, failureKindFilter, providerFilter, query, statusFilter, taskFilter],
  )

  function clearModelCallFilters() {
    setStatusFilter('all')
    setTaskFilter('all')
    setProviderFilter('all')
    setFailureKindFilter('all')
    setQuery('')
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
          <button type="button" className="ghost-button" onClick={props.onTestAiProvider}>运行测试</button>
          <button type="button" className="ghost-button" onClick={() => props.onLoadMarkdownFile(defaultPath)}>打开历史</button>
        </div>
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
          <span>{failureSummary.totalFailed} 条失败调用</span>
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
              return (
              <article className={`model-call-row ${entry.status}`} key={entry.id}>
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
                  <div><dt>Token</dt><dd>{entry.totalTokens ?? '-'}</dd></div>
                  <div><dt>费用</dt><dd>{estimatedCost === null ? '-' : formatUsd(estimatedCost)}</dd></div>
                  <div><dt>错误</dt><dd>{entry.status === 'failed' ? failure.label : '-'}</dd></div>
                  <div><dt>输出</dt><dd>{entry.output}</dd></div>
                </dl>
                <p>{entry.message}</p>
                {entry.status === 'failed' && <p className="model-call-advice">{failure.advice}</p>}
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

function ProviderPanel(props: WorkspaceProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const parsed = parseProviders(props.aiProvidersJson)
  const providers = parsed.ok ? parsed.providers : []
  const coverage = PROVIDER_USE_CASES.map((useCase) => ({
    ...useCase,
    provider: providers.find((provider) =>
      provider.enabled !== false &&
      (provider.useCases.length === 0 || provider.useCases.includes(useCase.key)),
    ),
  }))

  function updateProviders(nextProviders: AiProviderDraft[]) {
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

  function toggleUseCase(index: number, useCase: string) {
    const provider = providers[index]
    const current = new Set(provider.useCases)
    if (current.has(useCase)) current.delete(useCase)
    else current.add(useCase)
    updateProvider(index, { useCases: Array.from(current) })
  }

  function addProvider() {
    updateProviders([
      ...providers,
      {
        id: `provider-${providers.length + 1}`,
        name: '新 Provider',
        kind: 'openai-compatible',
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: '',
        contextWindow: 128000,
        temperature: 0.7,
        maxTokens: 4096,
        timeoutSeconds: 90,
        inputPricePerMillionTokens: 0,
        outputPricePerMillionTokens: 0,
        useCases: ['chapter'],
      },
    ])
  }

  function duplicateProvider(index: number) {
    const provider = providers[index]
    updateProviders([
      ...providers.slice(0, index + 1),
      { ...provider, id: `${provider.id || 'provider'}-copy`, name: `${provider.name || 'Provider'} 副本` },
      ...providers.slice(index + 1),
    ])
  }

  function deleteProvider(index: number) {
    updateProviders(providers.filter((_, providerIndex) => providerIndex !== index))
  }

  function exportProviders() {
    const blob = new Blob([buildProviderExportJson(props.aiProvidersJson)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'olienta-ai-providers.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importProviders(file: File | undefined) {
    if (!file) return
    const content = await file.text()
    try {
      const parsedContent = JSON.parse(content) as unknown
      props.onChangeAiProvidersJson(`${JSON.stringify(parsedContent, null, 2)}\n`)
    } catch {
      props.onChangeAiProvidersJson(content.endsWith('\n') ? content : `${content}\n`)
    }
  }

  return (
    <section className="provider-workspace">
      <section className="provider-overview">
        <div className="card-heading">
          <div>
            <h2>AI Provider</h2>
            <p>按顺序匹配用途；同一用途会优先使用排在前面的可用 Provider。</p>
          </div>
          <div className="editor-actions">
            <button type="button" className="ghost-button" onClick={addProvider} disabled={!parsed.ok}>新增</button>
            <button type="button" className="ghost-button" onClick={exportProviders}>导出 JSON</button>
            <button type="button" className="ghost-button" onClick={() => importInputRef.current?.click()}>导入 JSON</button>
            <button type="button" className="ghost-button" onClick={props.onTestAiProvider}>测试</button>
            <span className="status-pill">{props.providerTestMessage}</span>
          </div>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void importProviders(event.target.files?.[0]).finally(() => {
              event.currentTarget.value = ''
            })
          }}
        />
        {!parsed.ok && <p className="empty-note danger">Provider JSON 无法解析：{parsed.message}</p>}
        {parsed.ok && <p className="empty-note">API Key 保存到项目时会转为本地加密字段；导出 JSON 默认不包含密钥。</p>}
        {parsed.ok && (
          <>
            <div className="provider-coverage-grid">
              {coverage.map((item) => (
                <article key={item.key}>
                  <span>{item.title}</span>
                  <strong>{item.provider?.name || item.provider?.id || '未覆盖'}</strong>
                  <small>{item.provider?.model || item.detail}</small>
                </article>
              ))}
            </div>
            <div className="provider-grid">
              {providers.map((provider, index) => (
                <article className={`provider-card ${provider.enabled === false ? 'disabled' : ''}`} key={`${provider.id}-${index}`}>
                  <div className="provider-card-header">
                    <div>
                      <h3>{provider.name || provider.id || `Provider ${index + 1}`}</h3>
                      <p>{provider.kind || 'openai-compatible'} · {provider.model || '未设置模型'}</p>
                    </div>
                    <div className="editor-actions">
                      <button type="button" className="ghost-button" onClick={() => moveProvider(index, -1)} disabled={index === 0}>上移</button>
                      <button type="button" className="ghost-button" onClick={() => moveProvider(index, 1)} disabled={index === providers.length - 1}>下移</button>
                      <button type="button" className="ghost-button" onClick={() => duplicateProvider(index)}>复制</button>
                      <button type="button" className="ghost-button danger" onClick={() => deleteProvider(index)}>删除</button>
                    </div>
                  </div>
                  <div className="provider-settings">
                    <label className="switch-row">
                      <input
                        type="checkbox"
                        checked={provider.enabled !== false}
                        onChange={(event) => updateProvider(index, { enabled: event.target.checked })}
                      />
                      <span>启用</span>
                    </label>
                    <label>
                      <span>名称</span>
                      <input value={provider.name} onChange={(event) => updateProvider(index, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>类型</span>
                      <input value={provider.kind} onChange={(event) => updateProvider(index, { kind: event.target.value })} />
                    </label>
                    <label>
                      <span>Base URL</span>
                      <input value={provider.baseUrl} onChange={(event) => updateProvider(index, { baseUrl: event.target.value })} />
                    </label>
                    <label>
                      <span>模型</span>
                      <input value={provider.model} onChange={(event) => updateProvider(index, { model: event.target.value })} />
                    </label>
                    <label>
                      <span>上下文窗口</span>
                      <input
                        type="number"
                        step="1000"
                        min="0"
                        value={provider.contextWindow ?? 0}
                        onChange={(event) => updateProvider(index, { contextWindow: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>温度</span>
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
                      <span>最大输出</span>
                      <input
                        type="number"
                        step="256"
                        min="0"
                        value={provider.maxTokens ?? 0}
                        onChange={(event) => updateProvider(index, { maxTokens: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>超时秒数</span>
                      <input
                        type="number"
                        step="5"
                        min="5"
                        max="300"
                        value={provider.timeoutSeconds ?? 90}
                        onChange={(event) => updateProvider(index, { timeoutSeconds: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>输入百万 Token 美元</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={provider.inputPricePerMillionTokens ?? 0}
                        onChange={(event) => updateProvider(index, { inputPricePerMillionTokens: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>输出百万 Token 美元</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={provider.outputPricePerMillionTokens ?? 0}
                        onChange={(event) => updateProvider(index, { outputPricePerMillionTokens: numberOrUndefined(event.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="use-case-row">
                    {PROVIDER_USE_CASES.map((useCase) => (
                      <label key={useCase.key}>
                        <input
                          type="checkbox"
                          checked={provider.useCases.includes(useCase.key)}
                          onChange={() => toggleUseCase(index, useCase.key)}
                        />
                        <span>{useCase.title}</span>
                      </label>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <MarkdownDocument
        title="原始 JSON"
        path=".olienta/ai-providers.json"
        value={props.aiProvidersJson}
        onChange={props.onChangeAiProvidersJson}
        onSave={props.onSaveAiProviders}
      />
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
  contextWindow?: number
  temperature?: number
  maxTokens?: number
  timeoutSeconds?: number
  inputPricePerMillionTokens?: number
  outputPricePerMillionTokens?: number
  useCases: string[]
  [key: string]: unknown
}

const PROVIDER_USE_CASES = [
  { key: 'chapter', title: '整章正文', detail: '候选稿生成' },
  { key: 'blueprint', title: '章节蓝图', detail: '蓝图草案' },
  { key: 'framework', title: '故事框架', detail: '框架草案' },
  { key: 'facts', title: '事实抽取', detail: '后续 AI 抽取' },
  { key: 'timeline', title: '时间线', detail: 'Pro 冲突检查' },
  { key: 'style', title: '风格提示', detail: '风格辅助' },
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
  return {
    ...value,
    id: typeof value.id === 'string' ? value.id : `provider-${index + 1}`,
    name: typeof value.name === 'string' ? value.name : `Provider ${index + 1}`,
    kind: typeof value.kind === 'string' ? value.kind : 'openai-compatible',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    model: typeof value.model === 'string' ? value.model : '',
    contextWindow: typeof value.contextWindow === 'number' ? value.contextWindow : 0,
    temperature: typeof value.temperature === 'number' ? value.temperature : 0.7,
    maxTokens: typeof value.maxTokens === 'number' ? value.maxTokens : 0,
    timeoutSeconds: typeof value.timeoutSeconds === 'number' ? value.timeoutSeconds : 90,
    inputPricePerMillionTokens: typeof value.inputPricePerMillionTokens === 'number' ? value.inputPricePerMillionTokens : 0,
    outputPricePerMillionTokens: typeof value.outputPricePerMillionTokens === 'number' ? value.outputPricePerMillionTokens : 0,
    useCases,
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

import { useState } from 'react'
import type { MarkdownFileSummary, PinnedContextItem, TaskItem } from '../../types'
import type { WorkspaceProps } from '../Workspace'
import { ChapterList, MarkdownDocument } from './EditorPanels'

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
  if (props.activeModuleView === 'model-providers' || props.activeView === 'ai-providers') {
    return <ProviderPanel {...props} />
  }

  const defaultPath = 'logs/model-calls/history.md'

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
  return (
    <MarkdownDocument
      title="AI Provider 配置"
      path=".olienta/ai-providers.json"
      value={props.aiProvidersJson}
      onChange={props.onChangeAiProvidersJson}
      onSave={props.onSaveAiProviders}
      actions={
        <>
          <button className="ghost-button" onClick={props.onTestAiProvider}>测试</button>
          <span className="status-pill">{props.providerTestMessage}</span>
        </>
      }
    />
  )
}

function ExportPanelActions(props: WorkspaceProps) {
  return (
    <div className="editor-actions">
      <button className="ghost-button" onClick={() => props.onExportProject('markdown', 'all')}>导出全书 MD</button>
      <button className="ghost-button" onClick={() => props.onExportProject('txt', 'all')}>导出 TXT</button>
      <button className="ghost-button" onClick={() => props.onExportProject('docx', 'all')}>导出 DOCX</button>
    </div>
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

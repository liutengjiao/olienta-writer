import type { ReactNode } from 'react'
import { VIEW_TITLES, type WorkspaceProps } from './types'
import { ChapterList, MarkdownDocument } from './EditorPanels'

const FRAMEWORK_PATHS: Record<string, string> = {
  'story-premise': 'framework/02-premise.md',
  characters: 'framework/03-characters.md',
  world: 'framework/05-world.md',
  'plot-outline': 'framework/04-plot-outline.md',
  timeline: 'timeline/events.md',
}

export function PageFrame(props: { title: string; subtitle?: string; children: ReactNode }) {
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

export function HomePanel(props: WorkspaceProps) {
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

export function NovelSettingsPanel(props: WorkspaceProps) {
  return (
    <section className="editor-card">
      <div className="card-heading"><h2>小说设置</h2></div>
      <HomePanel {...props} />
    </section>
  )
}

export function FrameworkPanel(props: WorkspaceProps) {
  if (props.activeView === 'timeline') {
    return (
      <MarkdownDocument
        title={VIEW_TITLES.timeline}
        path={props.timelineEventsPath}
        value={props.timelineEvents}
        onChange={props.onChangeTimelineEvents}
        onSave={props.onSaveTimelineEvents}
        actions={
          <span className="status-pill">
            {props.timelineSettings.enabled ? 'Timeline Pro 已启用' : '普通时间线'}
          </span>
        }
      />
    )
  }

  const path = FRAMEWORK_PATHS[props.activeView] ?? props.frameworkPath
  return (
    <MarkdownDocument
      title={VIEW_TITLES[props.activeView] ?? '框架文件'}
      path={path}
      value={props.frameworkContent}
      onChange={props.onChangeFrameworkContent}
      onSave={props.onSaveFrameworkFile}
      actions={
        <>
          <button className="ghost-button" onClick={props.onGenerateFrameworkDraft}>生成草案</button>
        </>
      }
    />
  )
}

export function BlueprintPanel(props: WorkspaceProps) {
  return (
    <section className="blueprint-workspace split-editor-layout">
      <ChapterList {...props} />
      <div className="blueprint-editor-stack">
        <MarkdownDocument
          title="作者输入"
          path={props.authorInputPath}
          value={props.authorInput}
          onChange={props.onChangeAuthorInput}
          onSave={props.onSaveAuthorInput}
          actions={
            <button className="ghost-button" onClick={props.onGenerateBlueprintDraft}>生成蓝图草稿</button>
          }
        />
        <MarkdownDocument
          title="章节蓝图"
          path={props.blueprintPath}
          value={props.blueprint}
          onChange={props.onChangeBlueprint}
          onSave={props.onSaveBlueprint}
          actions={
            <>
              <button className="ghost-button" onClick={props.onComposeBrief}>装配任务书</button>
              <button className="ghost-button" onClick={props.onRegenerateFollowingBlueprints}>重生成后续</button>
              <button className="ghost-button" onClick={props.onRegenerateAllBlueprints}>重生成全部</button>
            </>
          }
        />
      </div>
      <aside className="blueprint-history">
        <div className="panel-heading">
          <h2>蓝图历史</h2>
          <span>{props.blueprintHistory.length}</span>
        </div>
        <div className="compact-list">
          {props.blueprintHistory.length === 0 && <p className="empty-note">还没有保存过蓝图历史。</p>}
          {props.blueprintHistory.map((item) => (
            <button
              type="button"
              className={`compact-row ${item.relative_path === props.selectedBlueprintHistoryPath ? 'active' : ''}`}
              key={item.relative_path}
              onClick={() => props.onLoadBlueprintHistory(item.relative_path)}
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
          value={props.blueprintHistoryPreview || '选择一个已保存的蓝图版本进行预览。'}
        />
        <button
          type="button"
          className="primary-button"
          disabled={!props.selectedBlueprintHistoryPath || !props.blueprintHistoryPreview.trim()}
          onClick={() => props.onChangeBlueprint(props.blueprintHistoryPreview)}
        >
          恢复到编辑器
        </button>
      </aside>
    </section>
  )
}

function openAgent() {
  window.dispatchEvent(new CustomEvent('olienta:open-agent'))
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

import type { ReactNode } from 'react'
import type { WorkspaceProps } from '../Workspace'
import { ChapterList, MarkdownDocument } from './EditorPanels'

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
  const path = FRAMEWORK_PATHS[props.activeView] ?? props.frameworkPath
  return (
    <MarkdownDocument
      title={VIEW_TITLES[props.activeView] ?? '框架文件'}
      path={path}
      value={props.frameworkContent || props.markdownPreview}
      onChange={props.onChangeMarkdownPreview}
      onSave={() => props.onSaveModuleMarkdownFile(path, props.markdownPreview || props.frameworkContent)}
    />
  )
}

export function BlueprintPanel(props: WorkspaceProps) {
  return (
    <section className="split-editor-layout">
      <ChapterList {...props} />
      <MarkdownDocument
        title="章节蓝图"
        path={props.blueprintPath}
        value={props.blueprint}
        onChange={props.onChangeBlueprint}
        onSave={props.onSaveBlueprint}
        actions={
          <>
            <button className="ghost-button" onClick={props.onGenerateBlueprintDraft}>生成草案</button>
            <button className="ghost-button" onClick={props.onComposeBrief}>装配任务书</button>
          </>
        }
      />
    </section>
  )
}

function openAgent() {
  window.dispatchEvent(new CustomEvent('olienta:open-agent'))
}

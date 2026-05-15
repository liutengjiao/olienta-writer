import { DraftPanel, FocusMode, ManuscriptPanel } from './workspace/EditorPanels'
import {
  BlueprintPanel,
  FrameworkPanel,
  HomePanel,
  NovelSettingsPanel,
  PageFrame,
} from './workspace/CorePanels'
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
import { MODULE_TITLES, VIEW_TITLES, type WorkspaceProps } from './workspace/types'

type Props = WorkspaceProps

export function Workspace(props: Props) {
  if (props.focusMode) return <FocusMode {...props} />

  const title = VIEW_TITLES[props.activeView] ?? MODULE_TITLES[props.activeModule] ?? 'Olienta'
  const subtitle = props.project
    ? props.project.root_path
    : '本地优先写作工作台。打开或创建项目后，可以直接编辑本地 Markdown 文件。'

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

import { DraftPanel, FocusMode, ManuscriptPanel } from './workspace/EditorPanels'
import {
  BlueprintPanel,
  ContinueWritingPanel,
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
import type { TranslationKey } from '../i18n'
import { isTauriRuntime } from '../constants'
import { MODULE_TITLES, VIEW_TITLES, type WorkspaceProps } from './workspace/types'

type Props = WorkspaceProps

export function Workspace(props: Props) {
  if (props.focusMode) return <FocusMode {...props} />

  const isHome = props.activeModule === 'home'
  const title = isHome
    ? props.t(props.locale, 'panel.projectManagement')
    : props.activeModule === 'project-structure'
      ? translatedViewTitle(props, props.activeView) ?? translatedModuleTitle(props, props.activeModule) ?? 'Olienta'
    : translatedModuleViewTitle(props, props.activeModuleView) ?? translatedViewTitle(props, props.activeView) ?? translatedModuleTitle(props, props.activeModule) ?? 'Olienta'
  const subtitle = isHome
    ? props.t(props.locale, 'workspace.homeSubtitle')
    : props.project
      ? ''
      : props.t(props.locale, 'workspace.localFirstSubtitle')

  return (
    <section className="workspace" aria-label="Olienta workspace">
      <div className="top-tabs">
        <div className="top-tab active">{title}</div>
      </div>
      <div className="workspace-scroll">
        {!isTauriRuntime && (
          <div className="preview-mode-banner">
            {props.locale === 'en-US'
              ? 'Browser preview only: local file access, project opening, and real AI calls require the desktop app. Install a release build or run npm run desktop:dev.'
              : '浏览器预览模式：无法读写本地文件，打开项目和真实 AI 调用都需要桌面版。请安装发布包，或运行 npm run desktop:dev。'}
          </div>
        )}
        {props.isProjectReadOnly && (
          <div className="preview-mode-banner">
            当前为示例预览只读项目；请在首页新建或打开自己的本地项目后再保存、导入或使用 AI 生成。
          </div>
        )}
        <PageFrame title={title} subtitle={subtitle} hideAssistant={props.activeModule === 'home' || props.activeModule === 'knowledge'} assistantDisabled={props.isProjectReadOnly}>
          <RouteContent {...props} />
        </PageFrame>
      </div>
    </section>
  )
}

const MODULE_VIEW_TITLES: Partial<Record<string, string>> = {
  'knowledge-overview': '知识库总览',
  'knowledge-facts': '事实库',
  'knowledge-markdown': '本地 Markdown',
  'knowledge-skills': 'Skill',
  'knowledge-search': '本地全文检索',
  'characters-overview': '角色总览',
  'characters-cards': '角色卡',
  'characters-relations': '关系图谱',
  'characters-growth': '成长线',
  'tasks-current': '当前任务',
  'tasks-history': '任务历史',
  'logs-author-confirmation': '作者确认日志',
  'logs-confirmations': '采用确认',
  'logs-system-events': '系统事件',
  'model-providers': 'AI Provider',
  'model-call-records': '调用记录',
  'model-tests': '模型测试',
}

const MODULE_VIEW_TITLE_KEYS: Partial<Record<string, TranslationKey>> = {
  'knowledge-overview': 'nav.knowledge',
  'knowledge-facts': 'module.knowledge.facts',
  'knowledge-markdown': 'module.knowledge.markdown',
  'knowledge-skills': 'module.knowledge.skillsDetail',
  'knowledge-search': 'module.knowledge.search',
  'characters-overview': 'module.characters.overview',
  'characters-cards': 'module.characters.cards',
  'characters-relations': 'module.characters.relations',
  'characters-growth': 'module.characters.growth',
  'tasks-current': 'module.tasks.current',
  'tasks-history': 'module.tasks.history',
  'logs-author-confirmation': 'module.logs.author',
  'logs-confirmations': 'module.logs.confirmations',
  'logs-system-events': 'module.logs.system',
  'model-providers': 'module.models.providers',
  'model-call-records': 'module.models.records',
  'model-tests': 'module.models.tests',
}

const VIEW_TITLE_KEYS: Partial<Record<string, TranslationKey>> = {
  'novel-settings': 'panel.novelSettings',
  'story-premise': 'panel.storyPremise',
  characters: 'panel.characterMap',
  world: 'panel.world',
  'plot-outline': 'panel.plotOutline',
  'important-scenes': 'panel.importantScenes',
  timeline: 'panel.timeline',
  'chapter-blueprint': 'panel.chapterBlueprint',
  manuscript: 'panel.manuscript',
  'local-files': 'panel.localFiles',
  exports: 'panel.exports',
}

const MODULE_TITLE_KEYS: Partial<Record<string, TranslationKey>> = {
  home: 'nav.home',
  'project-structure': 'panel.projectStructure',
  knowledge: 'nav.knowledge',
  characters: 'nav.characters',
  tasks: 'nav.tasks',
  logs: 'nav.logs',
  'model-calls': 'nav.models',
}

function translatedModuleViewTitle(props: Props, key: string) {
  const translationKey = MODULE_VIEW_TITLE_KEYS[key]
  return translationKey ? props.t(props.locale, translationKey) : MODULE_VIEW_TITLES[key]
}

function translatedViewTitle(props: Props, key: string) {
  const translationKey = VIEW_TITLE_KEYS[key]
  return translationKey ? props.t(props.locale, translationKey) : VIEW_TITLES[key]
}

function translatedModuleTitle(props: Props, key: string) {
  const translationKey = MODULE_TITLE_KEYS[key]
  return translationKey ? props.t(props.locale, translationKey) : MODULE_TITLES[key]
}

function RouteContent(props: Props) {
  if (props.activeModule === 'home') return <HomePanel {...props} />
  if (props.activeModule === 'characters') return <CharactersPanel {...props} />
  if (props.activeModule === 'knowledge') return <KnowledgePanel {...props} />
  if (props.activeModule === 'tasks') return <TasksPanel {...props} />
  if (props.activeModule === 'logs') return <LogsPanel {...props} />
  if (props.activeModule === 'model-calls') return <ModelCallsPanel {...props} />

  // Only route by activeView when we are within the 'project-structure' module
  if (props.activeModule === 'project-structure') {
    if (props.activeView === 'continue-writing') return <ContinueWritingPanel {...props} />
    if (props.activeView === 'novel-settings') return <NovelSettingsPanel {...props} />
    if (props.activeView === 'chapter-blueprint') return <BlueprintPanel {...props} />
    if (props.activeView === 'draft-box') return <DraftPanel {...props} />
    if (props.activeView === 'manuscript') return <ManuscriptPanel {...props} />
    if (props.activeView === 'facts') return <KnowledgeFactsPanel {...props} />
    if (props.activeView === 'skills') return <SkillPanel {...props} />
    if (props.activeView === 'local-files') return <LocalFilesPanel {...props} />
    if (props.activeView === 'ai-providers') return <ModelCallsPanel {...props} />
    if (props.activeView === 'exports') return <ExportPanel {...props} />
  }

  // Fallback to framework panel
  return <FrameworkPanel {...props} />
}

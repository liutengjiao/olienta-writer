import { useState } from 'react'
import type {
  ChapterSummary,
  ModuleKey,
  ModuleSubViewKey,
  ProjectSummary,
  RecentProject,
  ViewKey,
} from '../types'

type Props = {
  project: ProjectSummary | null
  message: string
  recentProjects: RecentProject[]
  chapters: ChapterSummary[]
  selectedChapterId: string
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  activeView: ViewKey
  onSelectRecentProject: (name: string, rootPath: string) => void
  onSelectChapter: (chapterId: string) => void
  onSelectModule: (module: ModuleKey) => void
  onSelectModuleView: (view: ModuleSubViewKey) => void
  onSelectView: (view: ViewKey) => void
}

const storyItems: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: 'story-premise', label: '故事前提', icon: 'PR' },
  { key: 'characters', label: '角色图谱', icon: 'CH' },
  { key: 'world', label: '世界观', icon: 'WD' },
  { key: 'plot-outline', label: '情节大纲', icon: 'PL' },
  { key: 'timeline', label: '时间线及里程碑', icon: 'TL' },
]

type GroupKey = 'story' | 'blueprint' | 'draft' | 'manuscript'
type ToolGroupKey = GroupKey | 'tools'

const railMainItems: Array<{ label: string; icon: string; module: ModuleKey }> = [
  { label: '首页', icon: 'H', module: 'home' },
  { label: '项目结构', icon: 'P', module: 'project-structure' },
  { label: '知识库', icon: 'K', module: 'knowledge' },
  { label: '角色', icon: 'R', module: 'characters' },
]

const railBottomItems: Array<{ label: string; icon: string; module: ModuleKey }> = [
  { label: '任务', icon: 'T', module: 'tasks' },
  { label: '日志', icon: 'L', module: 'logs' },
  { label: '模型调用', icon: 'AI', module: 'model-calls' },
]

export function ModuleRail({
  activeModule,
  onSelectModule,
}: {
  activeModule: ModuleKey
  onSelectModule: (module: ModuleKey) => void
}) {
  return (
    <nav className="module-rail" aria-label="全局导航">
      <div className="module-rail-main">
        {railMainItems.map((item) => (
          <RailButton
            key={item.label}
            active={activeModule === item.module}
            icon={item.icon}
            label={item.label}
            onClick={() => onSelectModule(item.module)}
          />
        ))}
      </div>
      <div className="module-rail-bottom">
        {railBottomItems.map((item) => (
          <RailButton
            key={item.label}
            active={activeModule === item.module}
            icon={item.icon}
            label={item.label}
            onClick={() => onSelectModule(item.module)}
          />
        ))}
      </div>
    </nav>
  )
}

function RailButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`module-rail-button ${active ? 'active' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <span>{icon}</span>
    </button>
  )
}

export function ProjectPanel({
  project,
  message,
  recentProjects,
  chapters,
  selectedChapterId,
  activeModule,
  activeModuleView,
  activeView,
  onSelectRecentProject,
  onSelectChapter,
  onSelectModule,
  onSelectModuleView,
  onSelectView,
}: Props) {
  const [expanded, setExpanded] = useState<Record<ToolGroupKey, boolean>>({
    story: true,
    blueprint: true,
    draft: true,
    manuscript: true,
    tools: true,
  })

  function toggleGroup(group: ToolGroupKey, openView: ViewKey) {
    setExpanded((current) => ({ ...current, [group]: !current[group] }))
    onSelectView(openView)
  }

  return (
    <aside className="project-panel">
      {activeModule === 'project-structure' ? (
        <>
          <header className="project-panel-header">
            <p className="project-panel-kicker">项目结构</p>
            {project && (
              <div className="project-title-row">
                <h1>{project.name}</h1>
                <button type="button" className="icon-button" title="刷新项目">R</button>
              </div>
            )}
            {project && <p className="project-path">{project.root_path}</p>}
            {!project && <p className="project-path">{message}</p>}
          </header>
          <ProjectStructureTree
            activeView={activeView}
            chapters={chapters}
            expanded={expanded}
            project={project}
            selectedChapterId={selectedChapterId}
            onSelectChapter={onSelectChapter}
            onSelectView={onSelectView}
            toggleGroup={toggleGroup}
          />
        </>
      ) : (
        <ModulePanel
          activeModule={activeModule}
          activeModuleView={activeModuleView}
          project={project}
          recentProjects={recentProjects}
          onSelectModule={onSelectModule}
          onSelectModuleView={onSelectModuleView}
          onSelectRecentProject={onSelectRecentProject}
        />
      )}
    </aside>
  )
}

function ProjectStructureTree({
  activeView,
  chapters,
  expanded,
  project,
  selectedChapterId,
  onSelectChapter,
  onSelectView,
  toggleGroup,
}: {
  activeView: ViewKey
  chapters: ChapterSummary[]
  expanded: Record<ToolGroupKey, boolean>
  project: ProjectSummary | null
  selectedChapterId: string
  onSelectChapter: (chapterId: string) => void
  onSelectView: (view: ViewKey) => void
  toggleGroup: (group: ToolGroupKey, openView: ViewKey) => void
}) {
  return (
    <section className="tree-section vela-tree">
      <TreeButton
        active={activeView === 'novel-settings'}
        badge={project ? '已打开' : '入口'}
        icon="SET"
        label="小说设置"
        onClick={() => onSelectView('novel-settings')}
      />

      <TreeParent
        active={isStoryView(activeView)}
        count={`${storyItems.length}/5`}
        expanded={expanded.story}
        icon="ST"
        label="故事框架"
        onClick={() => toggleGroup('story', 'story-premise')}
      />
      {expanded.story && (
        <div className="tree-children">
          {storyItems.map((item) => (
            <TreeButton
              key={item.key}
              active={activeView === item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => onSelectView(item.key)}
            />
          ))}
        </div>
      )}

      <ChapterGroup
        activeView={activeView}
        chapters={chapters}
        countLabel={`${chapters.length} 章`}
        expanded={expanded.blueprint}
        icon="BP"
        label="章节蓝图"
        selectedChapterId={selectedChapterId}
        targetView="chapter-blueprint"
        onParentClick={() => toggleGroup('blueprint', 'chapter-blueprint')}
        onSelectChapter={onSelectChapter}
        onSelectView={onSelectView}
      />

      <ChapterGroup
        activeView={activeView}
        chapters={chapters}
        countLabel={`${chapters.length} 章`}
        expanded={expanded.draft}
        icon="DR"
        label="草稿箱"
        selectedChapterId={selectedChapterId}
        targetView="draft-box"
        onParentClick={() => toggleGroup('draft', 'draft-box')}
        onSelectChapter={onSelectChapter}
        onSelectView={onSelectView}
      />

      <ChapterGroup
        activeView={activeView}
        chapters={chapters}
        countLabel={`${chapters.filter((chapter) => chapter.words > 0).length} 章`}
        expanded={expanded.manuscript}
        icon="MS"
        label="正文"
        selectedChapterId={selectedChapterId}
        targetView="manuscript"
        onParentClick={() => toggleGroup('manuscript', 'manuscript')}
        onSelectChapter={onSelectChapter}
        onSelectView={onSelectView}
      />

      <TreeParent
        active={isToolView(activeView)}
        count="5"
        expanded={expanded.tools}
        icon="TL"
        label="工具与设置"
        onClick={() => toggleGroup('tools', 'facts')}
      />
      {expanded.tools && (
        <div className="tree-tools tree-children">
          <TreeButton active={activeView === 'facts'} badge="约束" icon="FT" label="事实库" onClick={() => onSelectView('facts')} />
          <TreeButton active={activeView === 'skills'} badge="已选" icon="SK" label="Skill" onClick={() => onSelectView('skills')} />
          <TreeButton active={activeView === 'ai-providers'} badge="API" icon="AI" label="AI Provider" onClick={() => onSelectView('ai-providers')} />
          <TreeButton active={activeView === 'local-files'} badge=".md" icon="MD" label="本地 Markdown" onClick={() => onSelectView('local-files')} />
          <TreeButton active={activeView === 'exports'} badge="MD/TXT/Word" icon="EX" label="导出" onClick={() => onSelectView('exports')} />
        </div>
      )}
    </section>
  )
}

function ModulePanel({
  activeModule,
  activeModuleView,
  project,
  recentProjects,
  onSelectModule,
  onSelectModuleView,
  onSelectRecentProject,
}: {
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  project: ProjectSummary | null
  recentProjects: RecentProject[]
  onSelectModule: (module: ModuleKey) => void
  onSelectModuleView: (view: ModuleSubViewKey) => void
  onSelectRecentProject: (name: string, rootPath: string) => void
}) {
  const meta = getModuleMeta(activeModule)

  return (
    <>
      <header className="project-panel-header">
        <p className="project-panel-kicker">{meta.kicker}</p>
        <div className="project-title-row">
          <h1>{meta.title}</h1>
        </div>
        <p className="project-path">{meta.description}</p>
      </header>
      <section className="tree-section vela-tree">
        {meta.items.map((item) => (
          <button
            type="button"
            className={`module-panel-row ${activeModuleView === item.view ? 'active' : ''}`}
            key={item.title}
            onClick={() => onSelectModuleView(item.view)}
          >
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
        {activeModule !== 'project-structure' && (
          <button type="button" className="tree-item" onClick={() => onSelectModule('project-structure')}>
            <span><b>P</b>返回项目结构</span>
          </button>
        )}
      </section>
      {activeModule === 'home' && recentProjects.length > 0 && !project && (
        <section className="recent-compact">
          <h2>最近项目</h2>
          {recentProjects.slice(0, 3).map((item) => (
            <button
              type="button"
              className="recent-row"
              key={item.root_path}
              onClick={() => onSelectRecentProject(item.name, item.root_path)}
            >
              <strong>{item.name}</strong>
              <span>{item.root_path}</span>
            </button>
          ))}
        </section>
      )}
    </>
  )
}

function getModuleMeta(module: ModuleKey) {
  const map: Record<ModuleKey, {
    kicker: string
    title: string
    description: string
    items: Array<{ title: string; detail: string; view: ModuleSubViewKey }>
  }> = {
    home: {
      kicker: '首页',
      title: '项目入口',
      description: '新建、打开和导入本地小说项目。这里是软件入口，不承载小说框架编辑。',
      items: [
        { title: '项目入口', detail: '创建或打开本地 Olienta 项目', view: 'home-entry' },
        { title: '最近项目', detail: '快速回到最近写作项目', view: 'home-recent' },
      ],
    },
    'project-structure': {
      kicker: '项目结构',
      title: '项目结构',
      description: '小说设置、故事框架、章节蓝图、草稿箱和正文都属于这里。',
      items: [],
    },
    knowledge: {
      kicker: '知识库',
      title: '知识库',
      description: '管理事实、伏笔、本地 Markdown、Skill 和本地全文检索。',
      items: [
        { title: '知识库总览', detail: '项目健康、事实、伏笔、Skill 和资料状态', view: 'knowledge-overview' },
        { title: '事实库', detail: '已确认事实、未闭合伏笔和禁止违背规则', view: 'knowledge-facts' },
        { title: '本地 Markdown', detail: '查看项目内所有 .md 文件', view: 'knowledge-markdown' },
        { title: 'Skill', detail: '导入和选择写作方法文件', view: 'knowledge-skills' },
        { title: '本地全文检索', detail: '按范围检索本地资料，并钉选进任务书', view: 'knowledge-search' },
      ],
    },
    characters: {
      kicker: '角色',
      title: '角色管理',
      description: '从角色图谱拆出角色卡、关系图和成长线。',
      items: [
        { title: '角色总览', detail: '人物卡、关系和成长状态', view: 'characters-overview' },
        { title: '角色列表', detail: '从角色图谱抽取人物卡', view: 'characters-cards' },
        { title: '关系图谱', detail: '角色关系、欲望、利益和冲突', view: 'characters-relations' },
        { title: '成长线', detail: '角色状态随章节变化', view: 'characters-growth' },
      ],
    },
    tasks: {
      kicker: '任务',
      title: '任务',
      description: '管理当前章节任务书、钉选材料和 AI 工作流进度。',
      items: [
        { title: '当前任务', detail: '当前章节任务书、钉选材料和生成入口', view: 'tasks-current' },
        { title: '历史任务', detail: '已完成或失败的任务记录', view: 'tasks-history' },
      ],
    },
    logs: {
      kicker: '日志',
      title: '日志',
      description: '记录作者确认、保存、导出、蓝图覆盖和事实抽取事件。',
      items: [
        { title: '作者确认日志', detail: '正文保存后的确认记录', view: 'logs-author-confirmation' },
        { title: '系统事件', detail: '蓝图覆盖、事实重扫和导出记录', view: 'logs-system-events' },
      ],
    },
    'model-calls': {
      kicker: '模型调用',
      title: '模型调用',
      description: '集中管理 AI Provider、模型测试和调用记录。',
      items: [
        { title: 'AI Provider', detail: '配置 API、模型和用途', view: 'model-providers' },
        { title: '调用记录', detail: '记录每次 AI 请求和结果', view: 'model-call-records' },
        { title: '连接测试', detail: '测试默认 Provider 是否可用', view: 'model-tests' },
      ],
    },
  }

  return map[module]
}

function ChapterGroup({
  activeView,
  chapters,
  countLabel,
  expanded,
  icon,
  label,
  selectedChapterId,
  targetView,
  onParentClick,
  onSelectChapter,
  onSelectView,
}: {
  activeView: ViewKey
  chapters: ChapterSummary[]
  countLabel: string
  expanded: boolean
  icon: string
  label: string
  selectedChapterId: string
  targetView: ViewKey
  onParentClick: () => void
  onSelectChapter: (chapterId: string) => void
  onSelectView: (view: ViewKey) => void
}) {
  const active = activeView === targetView

  return (
    <div className="tree-group">
      <TreeParent
        active={active}
        count={countLabel}
        expanded={expanded}
        icon={icon}
        label={label}
        onClick={onParentClick}
      />
      {expanded && (
        <div className="tree-children chapter-children">
          {chapters.length === 0 ? (
            <p className="tree-empty">打开项目后显示章节</p>
          ) : (
            chapters.map((chapter, index) => (
              <button
                type="button"
                className={`chapter-row compact ${active && chapter.id === selectedChapterId ? 'active' : ''}`}
                key={`${targetView}-${chapter.id}`}
                onClick={() => {
                  onSelectChapter(chapter.id)
                  onSelectView(targetView)
                }}
              >
                <span>{index + 1}</span>
                <strong>{chapter.title}</strong>
                <small>{chapter.words} 字 · {chapter.state}</small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TreeParent({
  active,
  count,
  expanded,
  icon,
  label,
  onClick,
}: {
  active: boolean
  count: string
  expanded: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`tree-item parent ${active ? 'active' : ''}`} onClick={onClick}>
      <span>
        <i>{expanded ? 'v' : '>'}</i>
        <b>{icon}</b>
        {label}
      </span>
      <small>{count}</small>
    </button>
  )
}

function TreeButton({
  active,
  badge,
  icon,
  label,
  onClick,
}: {
  active: boolean
  badge?: string
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`tree-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span><b>{icon}</b>{label}</span>
      {badge && <small>{badge}</small>}
    </button>
  )
}

function isStoryView(view: ViewKey) {
  return (
    view === 'story-premise' ||
    view === 'characters' ||
    view === 'world' ||
    view === 'plot-outline' ||
    view === 'timeline'
  )
}

function isToolView(view: ViewKey) {
  return (
    view === 'facts' ||
    view === 'skills' ||
    view === 'ai-providers' ||
    view === 'local-files' ||
    view === 'exports'
  )
}

import { useState, type ReactNode } from 'react'
import type {
  ChapterSummary,
  ModuleKey,
  ModuleSubViewKey,
  ProjectSummary,
  RecentProject,
  ViewKey,
  VolumeInfo,
} from '../types'
import type { Locale, TranslationKey } from '../i18n'

type T = (locale: Locale, key: TranslationKey) => string

type Props = {
  project: ProjectSummary | null
  message: string
  recentProjects: RecentProject[]
  chapters: ChapterSummary[]
  volumes: VolumeInfo[]
  selectedChapterId: string
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  activeView: ViewKey
  locale: Locale
  t: T
  onSelectRecentProject: (name: string, rootPath: string) => void
  onSelectChapter: (chapterId: string) => void
  onSelectModule: (module: ModuleKey) => void
  onSelectModuleView: (view: ModuleSubViewKey) => void
  onSelectView: (view: ViewKey) => void
}

const storyItems: Array<{ key: ViewKey; labelKey: TranslationKey; icon: string }> = [
  { key: 'story-premise', labelKey: 'panel.storyPremise', icon: 'SP' },
  { key: 'characters', labelKey: 'panel.characterMap', icon: 'CH' },
  { key: 'world', labelKey: 'panel.world', icon: 'WD' },
  { key: 'plot-outline', labelKey: 'panel.plotOutline', icon: 'PL' },
  { key: 'important-scenes', labelKey: 'panel.importantScenes', icon: 'SC' },
  { key: 'timeline', labelKey: 'panel.timeline', icon: 'TL' },
]

type GroupKey = 'story' | 'blueprint' | 'manuscript' | 'library'

const railMainItems: Array<{ labelKey: TranslationKey; icon: ReactNode; module: ModuleKey }> = [
  { labelKey: 'nav.home', icon: <HomeIcon />, module: 'home' },
  { labelKey: 'nav.project', icon: <ProjectIcon />, module: 'project-structure' },
  { labelKey: 'nav.knowledge', icon: <KnowledgeIcon />, module: 'knowledge' },
  { labelKey: 'nav.characters', icon: <CharactersIcon />, module: 'characters' },
]

const railBottomItems: Array<{ labelKey: TranslationKey; icon: ReactNode; module: ModuleKey }> = [
  { labelKey: 'nav.tasks', icon: <TasksIcon />, module: 'tasks' },
  { labelKey: 'nav.logs', icon: <LogsIcon />, module: 'logs' },
  { labelKey: 'nav.models', icon: <ModelIcon />, module: 'model-calls' },
]

export function ModuleRail({
  activeModule,
  locale,
  onSelectModule,
  t,
}: {
  activeModule: ModuleKey
  locale: Locale
  onSelectModule: (module: ModuleKey) => void
  t: T
}) {
  return (
    <nav className="module-rail" aria-label={t(locale, 'tools.label')}>
      <div className="module-rail-main">
        {railMainItems.map((item) => (
          <RailButton
            key={item.module}
            active={activeModule === item.module}
            icon={item.icon}
            label={t(locale, item.labelKey)}
            onClick={() => onSelectModule(item.module)}
          />
        ))}
      </div>
      <div className="module-rail-bottom">
        {railBottomItems.map((item) => (
          <RailButton
            key={item.module}
            active={activeModule === item.module}
            icon={item.icon}
            label={t(locale, item.labelKey)}
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
  icon: ReactNode
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
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}

function RailSvg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

function HomeIcon() {
  return <RailSvg><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></RailSvg>
}

function ProjectIcon() {
  return <RailSvg><path d="M4 5h6l2 2h8v12H4z" /><path d="M4 10h16" /></RailSvg>
}

function KnowledgeIcon() {
  return <RailSvg><path d="M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 1-3-3z" /><path d="M8 4v13a3 3 0 0 0 3 3" /><path d="M10 8h5" /><path d="M10 12h4" /></RailSvg>
}

function CharactersIcon() {
  return <RailSvg><path d="M16 11a4 4 0 1 0-8 0" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M18 8a3 3 0 0 1 3 3" /><path d="M21 20a5 5 0 0 0-3-4.5" /></RailSvg>
}

function TasksIcon() {
  return <RailSvg><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><path d="m3.5 6 1 1 2-2" /><path d="m3.5 12 1 1 2-2" /><path d="m3.5 18 1 1 2-2" /></RailSvg>
}

function LogsIcon() {
  return <RailSvg><path d="M6 4h9l3 3v13H6z" /><path d="M15 4v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></RailSvg>
}

function ModelIcon() {
  return <RailSvg><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 10h4v4h-4z" /></RailSvg>
}

export function ProjectPanel({
  project,
  message,
  recentProjects,
  chapters,
  volumes,
  selectedChapterId,
  activeModule,
  activeModuleView,
  activeView,
  locale,
  t,
  onSelectRecentProject,
  onSelectChapter,
  onSelectModule,
  onSelectModuleView,
  onSelectView,
}: Props) {
  const [expanded, setExpanded] = useState<Record<GroupKey, boolean>>({
    story: true,
    blueprint: false,
    manuscript: false,
    library: false,
  })

  function toggleGroup(group: GroupKey, openView: ViewKey) {
    setExpanded((current) => {
      const next = { ...current, [group]: !current[group] }
      if (group === 'blueprint' && next.blueprint) next.manuscript = false
      if (group === 'manuscript' && next.manuscript) next.blueprint = false
      return next
    })
    onSelectView(openView)
  }

  return (
    <aside className="project-panel">
      {activeModule === 'project-structure' ? (
        <>
          <header className="project-panel-header">
            <p className="project-panel-kicker">{t(locale, 'panel.projectStructure')}</p>
            {project && (
              <div className="project-title-row">
                <h1>{project.name}</h1>
                <button type="button" className="icon-button" title={t(locale, 'panel.refreshProject')}>R</button>
              </div>
            )}
            {!project && <p className="project-path">{message}</p>}
          </header>
          <ProjectStructureTree
            activeView={activeView}
            chapters={chapters}
            volumes={volumes}
            expanded={expanded}
            project={project}
            selectedChapterId={selectedChapterId}
            onSelectChapter={onSelectChapter}
            onSelectView={onSelectView}
            locale={locale}
            t={t}
            toggleGroup={toggleGroup}
          />
        </>
      ) : (
        <ModulePanel
          activeModule={activeModule}
          activeModuleView={activeModuleView}
          project={project}
          recentProjects={recentProjects}
          locale={locale}
          onSelectModule={onSelectModule}
          onSelectModuleView={onSelectModuleView}
          onSelectRecentProject={onSelectRecentProject}
          t={t}
        />
      )}
    </aside>
  )
}

function ProjectStructureTree({
  activeView,
  chapters,
  volumes,
  expanded,
  project,
  selectedChapterId,
  onSelectChapter,
  onSelectView,
  locale,
  t,
  toggleGroup,
}: {
  activeView: ViewKey
  chapters: ChapterSummary[]
  volumes: VolumeInfo[]
  expanded: Record<GroupKey, boolean>
  project: ProjectSummary | null
  selectedChapterId: string
  onSelectChapter: (chapterId: string) => void
  onSelectView: (view: ViewKey) => void
  locale: Locale
  t: T
  toggleGroup: (group: GroupKey, openView: ViewKey) => void
}) {
  return (
    <section className="tree-section vela-tree">
      <TreeParent
        active={activeView === 'novel-settings'}
        count={project ? 'Open' : 'Entry'}
        expanded
        icon="SET"
        label={t(locale, 'panel.novelSettings')}
        onClick={() => onSelectView('novel-settings')}
      />

      <TreeParent
        active={isStoryView(activeView)}
        count={`${storyItems.length}/6`}
        expanded={expanded.story}
        icon="ST"
        label={t(locale, 'panel.storyFrame')}
        onClick={() => toggleGroup('story', 'story-premise')}
      />
      {expanded.story && (
        <div className="tree-children">
          {storyItems.map((item) => (
            <TreeButton
              key={item.key}
              active={activeView === item.key}
              icon={item.icon}
              label={t(locale, item.labelKey)}
              onClick={() => onSelectView(item.key)}
            />
          ))}
        </div>
      )}

      <ChapterGroup
        activeView={activeView}
        chapters={chapters}
        volumes={volumes}
        countLabel={`${chapters.length}`}
        expanded={expanded.blueprint}
        icon="BP"
        label={t(locale, 'panel.chapterBlueprint')}
        emptyLabel={t(locale, 'panel.openProjectChapters')}
        selectedChapterId={selectedChapterId}
        targetView="chapter-blueprint"
        onParentClick={() => toggleGroup('blueprint', 'chapter-blueprint')}
        onSelectChapter={onSelectChapter}
        onSelectView={onSelectView}
      />

      <ChapterGroup
        activeView={activeView}
        chapters={chapters}
        volumes={volumes}
        countLabel={`${chapters.filter((chapter) => chapter.words > 0).length}`}
        expanded={expanded.manuscript}
        icon="MS"
        label={t(locale, 'panel.manuscript')}
        emptyLabel={t(locale, 'panel.openProjectChapters')}
        selectedChapterId={selectedChapterId}
        targetView="manuscript"
        alternateActiveView="draft-box"
        onParentClick={() => toggleGroup('manuscript', 'manuscript')}
        onSelectChapter={onSelectChapter}
        onSelectView={onSelectView}
      />

      <TreeParent
        active={activeView === 'local-files'}
        count="MD"
        expanded={expanded.library}
        icon="LB"
        label={t(locale, 'panel.library')}
        onClick={() => toggleGroup('library', 'local-files')}
      />
      {expanded.library && (
        <div className="tree-children">
          <TreeButton
            active={activeView === 'local-files'}
            badge=".md"
            icon="MD"
            label={t(locale, 'panel.localFiles')}
            onClick={() => onSelectView('local-files')}
          />
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
  locale,
  onSelectModule,
  onSelectModuleView,
  onSelectRecentProject,
  t,
}: {
  activeModule: ModuleKey
  activeModuleView: ModuleSubViewKey
  project: ProjectSummary | null
  recentProjects: RecentProject[]
  locale: Locale
  onSelectModule: (module: ModuleKey) => void
  onSelectModuleView: (view: ModuleSubViewKey) => void
  onSelectRecentProject: (name: string, rootPath: string) => void
  t: T
}) {
  const meta = getModuleMeta(activeModule, locale, t)

  return (
    <>
      <header className="project-panel-header">
        <p className="project-panel-kicker">{meta.kicker}</p>
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
            {item.detail && <span>{item.detail}</span>}
          </button>
        ))}
        {activeModule !== 'project-structure' && activeModule !== 'home' && project && (
          <button type="button" className="tree-item" onClick={() => onSelectModule('project-structure')}>
            <span><b>{t(locale, 'nav.project')}</b>{t(locale, 'panel.enterProject')}</span>
          </button>
        )}
      </section>
      {activeModule === 'home' && recentProjects.length > 0 && !project && (
        <section className="recent-compact">
          {recentProjects.slice(0, 3).map((item) => (
            <button
              type="button"
              className="recent-row"
              key={item.root_path}
              onClick={() => onSelectRecentProject(item.name, item.root_path)}
            >
              <strong>{item.name}</strong>
            </button>
          ))}
        </section>
      )}
    </>
  )
}

function getModuleMeta(module: ModuleKey, locale: Locale, t: T) {
  const map: Record<ModuleKey, {
    kicker: string
    title: string
    description: string
    items: Array<{ title: string; detail: string; view: ModuleSubViewKey }>
  }> = {
    home: {
      kicker: t(locale, 'panel.projectManagement'),
      title: t(locale, 'panel.projectManagement'),
      description: '',
      items: [
        { title: t(locale, 'panel.newProject'), detail: '', view: 'home-entry' },
        { title: t(locale, 'panel.recentProjects'), detail: '', view: 'home-recent' },
      ],
    },
    'project-structure': {
      kicker: t(locale, 'panel.projectStructure'),
      title: t(locale, 'panel.projectStructure'),
      description: locale === 'en-US'
        ? 'Novel structure, story frame, library, chapter blueprints, and manuscript all live here. AI drafts stay in manuscript draft versions.'
        : '小说结构、故事框架、资料库、章节蓝图和正文都属于这里；AI 候选稿归入正文草稿版本。',
      items: [],
    },
    knowledge: {
      kicker: t(locale, 'nav.knowledge'),
      title: t(locale, 'nav.knowledge'),
      description: t(locale, 'module.knowledge.description'),
      items: [
        { title: t(locale, 'module.knowledge.markdown'), detail: t(locale, 'module.knowledge.markdownDetail'), view: 'knowledge-markdown' },
        { title: t(locale, 'module.knowledge.facts'), detail: t(locale, 'module.knowledge.factsDetail'), view: 'knowledge-facts' },
        { title: 'Skill', detail: t(locale, 'module.knowledge.skillsDetail'), view: 'knowledge-skills' },
        { title: t(locale, 'module.knowledge.search'), detail: t(locale, 'module.knowledge.searchDetail'), view: 'knowledge-search' },
      ],
    },
    characters: {
      kicker: t(locale, 'nav.characters'),
      title: t(locale, 'module.characters.title'),
      description: t(locale, 'module.characters.description'),
      items: [
        { title: t(locale, 'module.characters.overview'), detail: t(locale, 'module.characters.overviewDetail'), view: 'characters-overview' },
        { title: t(locale, 'module.characters.cards'), detail: t(locale, 'module.characters.cardsDetail'), view: 'characters-cards' },
        { title: t(locale, 'module.characters.relations'), detail: t(locale, 'module.characters.relationsDetail'), view: 'characters-relations' },
        { title: t(locale, 'module.characters.growth'), detail: t(locale, 'module.characters.growthDetail'), view: 'characters-growth' },
      ],
    },
    tasks: {
      kicker: t(locale, 'nav.tasks'),
      title: t(locale, 'nav.tasks'),
      description: t(locale, 'module.tasks.description'),
      items: [
        { title: t(locale, 'module.tasks.current'), detail: t(locale, 'module.tasks.currentDetail'), view: 'tasks-current' },
        { title: t(locale, 'module.tasks.history'), detail: t(locale, 'module.tasks.historyDetail'), view: 'tasks-history' },
      ],
    },
    logs: {
      kicker: t(locale, 'nav.logs'),
      title: t(locale, 'nav.logs'),
      description: t(locale, 'module.logs.description'),
      items: [
        { title: t(locale, 'module.logs.author'), detail: t(locale, 'module.logs.authorDetail'), view: 'logs-author-confirmation' },
        { title: t(locale, 'module.logs.system'), detail: t(locale, 'module.logs.systemDetail'), view: 'logs-system-events' },
      ],
    },
    'model-calls': {
      kicker: t(locale, 'nav.models'),
      title: t(locale, 'nav.models'),
      description: t(locale, 'module.models.description'),
      items: [
        { title: t(locale, 'module.models.providers'), detail: t(locale, 'module.models.providersDetail'), view: 'model-providers' },
        { title: t(locale, 'module.models.records'), detail: t(locale, 'module.models.recordsDetail'), view: 'model-call-records' },
        { title: t(locale, 'module.models.tests'), detail: t(locale, 'module.models.testsDetail'), view: 'model-tests' },
      ],
    },
  }

  return map[module]
}

function ChapterGroup({
  activeView,
  chapters,
  volumes,
  countLabel,
  expanded,
  icon,
  label,
  emptyLabel,
  selectedChapterId,
  targetView,
  alternateActiveView,
  onParentClick,
  onSelectChapter,
  onSelectView,
}: {
  activeView: ViewKey
  chapters: ChapterSummary[]
  volumes: VolumeInfo[]
  countLabel: string
  expanded: boolean
  icon: string
  label: string
  emptyLabel: string
  selectedChapterId: string
  targetView: ViewKey
  alternateActiveView?: ViewKey
  onParentClick: () => void
  onSelectChapter: (chapterId: string) => void
  onSelectView: (view: ViewKey) => void
}) {
  const active = activeView === targetView || activeView === alternateActiveView
  const chapterRows = chapterRowsWithVolumeDividers(chapters, volumes)

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
            <p className="tree-empty">{emptyLabel}</p>
          ) : (
            chapterRows.map((row) => (
              row.kind === 'volume' ? (
                <div className="chapter-volume-divider" key={`${targetView}-${row.volume.id}`}>
                  <strong>{row.volume.title}</strong>
                  <small>{row.volume.startChapter} - {row.volume.endChapter} 章</small>
                </div>
              ) : (
                <button
                  type="button"
                  className={`chapter-row compact ${active && row.chapter.id === selectedChapterId ? 'active' : ''}`}
                  key={`${targetView}-${row.chapter.id}`}
                  onClick={() => {
                    onSelectChapter(row.chapter.id)
                    onSelectView(targetView)
                  }}
                >
                  <span>{row.index + 1}</span>
                  <strong>{row.chapter.title}</strong>
                  <small>{row.chapter.words} 字 · {row.chapter.state}</small>
                </button>
              )
            ))
          )}
        </div>
      )}
    </div>
  )
}

function chapterRowsWithVolumeDividers(chapters: ChapterSummary[], volumes: VolumeInfo[]) {
  const rows: Array<
    | { kind: 'volume'; volume: VolumeInfo }
    | { kind: 'chapter'; chapter: ChapterSummary; index: number }
  > = []
  let currentVolumeId = ''
  chapters.forEach((chapter, index) => {
    const chapterNumber = Number(chapter.id)
    const volume = volumes.find((item) => chapterNumber >= item.startChapter && chapterNumber <= item.endChapter)
    if (volume && volume.id !== currentVolumeId) {
      rows.push({ kind: 'volume', volume })
      currentVolumeId = volume.id
    }
    rows.push({ kind: 'chapter', chapter, index })
  })
  return rows
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
        <i aria-hidden="true">{expanded ? '⌄' : ''}</i>
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
    view === 'important-scenes' ||
    view === 'timeline'
  )
}

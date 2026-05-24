export type Locale = 'zh-CN' | 'en-US'

export type TranslationKey =
  | 'app.tagline'
  | 'app.noProject'
  | 'tools.label'
  | 'tools.search'
  | 'tools.settings'
  | 'language.label'
  | 'support.button'
  | 'support.title'
  | 'support.body'
  | 'support.note'
  | 'support.wechatAlt'
  | 'support.paypalPending'
  | 'support.paypalLink'
  | 'support.feedback'
  | 'taskbar.title'
  | 'taskbar.emptyTasks'
  | 'taskbar.emptyLogs'
  | 'nav.home'
  | 'nav.project'
  | 'nav.knowledge'
  | 'nav.characters'
  | 'nav.tasks'
  | 'nav.logs'
  | 'nav.models'
  | 'panel.projectManagement'
  | 'panel.newProject'
  | 'panel.recentProjects'
  | 'panel.projectStructure'
  | 'panel.storyFrame'
  | 'panel.novelSettings'
  | 'panel.storyPremise'
  | 'panel.characterMap'
  | 'panel.world'
  | 'panel.plotOutline'
  | 'panel.importantScenes'
  | 'panel.timeline'
  | 'panel.chapterBlueprint'
  | 'panel.manuscript'
  | 'panel.library'
  | 'panel.localFiles'
  | 'panel.exports'
  | 'panel.enterProject'
  | 'panel.refreshProject'
  | 'panel.openProjectChapters'
  | 'workspace.homeSubtitle'
  | 'workspace.homeBrandLine'
  | 'workspace.homeBrandPromise'
  | 'workspace.localFirstSubtitle'
  | 'module.knowledge.description'
  | 'module.knowledge.markdown'
  | 'module.knowledge.markdownDetail'
  | 'module.knowledge.facts'
  | 'module.knowledge.factsDetail'
  | 'module.knowledge.skillsDetail'
  | 'module.knowledge.search'
  | 'module.knowledge.searchDetail'
  | 'module.characters.title'
  | 'module.characters.description'
  | 'module.characters.overview'
  | 'module.characters.overviewDetail'
  | 'module.characters.cards'
  | 'module.characters.cardsDetail'
  | 'module.characters.relations'
  | 'module.characters.relationsDetail'
  | 'module.characters.growth'
  | 'module.characters.growthDetail'
  | 'module.tasks.description'
  | 'module.tasks.current'
  | 'module.tasks.currentDetail'
  | 'module.tasks.history'
  | 'module.tasks.historyDetail'
  | 'module.logs.description'
  | 'module.logs.author'
  | 'module.logs.authorDetail'
  | 'module.logs.confirmations'
  | 'module.logs.confirmationsDetail'
  | 'module.logs.system'
  | 'module.logs.systemDetail'
  | 'module.models.description'
  | 'module.models.providers'
  | 'module.models.providersDetail'
  | 'module.models.records'
  | 'module.models.recordsDetail'
  | 'module.models.tests'
  | 'module.models.testsDetail'

const STORAGE_KEY = 'olienta.locale'

const translations: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': {
    'app.tagline': '作者为自己打造的 AI 写作平台。AI 可以替你写每一个字，但只有你决定哪一个字留下。',
    'app.noProject': '未打开项目',
    'tools.label': '窗口工具',
    'tools.search': '搜索',
    'tools.settings': '设置',
    'language.label': '语言',
    'support.button': '支持',
    'support.title': '支持 Olienta',
    'support.body': 'Olienta 免费开源。如果它帮你推进了作品，欢迎在这里放一杯咖啡钱，支持继续开发。',
    'support.note': '不弹窗、不打扰；扫码后由你自己确认金额。',
    'support.wechatAlt': '微信赞赏码',
    'support.paypalPending': '英文打赏入口待配置 PayPal.me 或 PayPal 收款邮箱。',
    'support.paypalLink': '通过 PayPal 支持',
    'support.feedback': '反馈邮箱：olientavip@gmail.com',
    'taskbar.title': '任务',
    'taskbar.emptyTasks': '暂无任务，AI 工作流启动后会在这里显示进度',
    'taskbar.emptyLogs': '等待任务日志。',
    'nav.home': '首页',
    'nav.project': '项目',
    'nav.knowledge': '知识',
    'nav.characters': '角色',
    'nav.tasks': '任务',
    'nav.logs': '日志',
    'nav.models': '模型',
    'panel.projectManagement': '项目管理',
    'panel.newProject': '新建项目',
    'panel.recentProjects': '最近项目',
    'panel.projectStructure': '项目结构',
    'panel.storyFrame': '故事框架',
    'panel.novelSettings': '小说结构',
    'panel.storyPremise': '故事梗概',
    'panel.characterMap': '角色图谱',
    'panel.world': '世界观',
    'panel.plotOutline': '情节大纲',
    'panel.importantScenes': '重要场景',
    'panel.timeline': '时间线与里程碑',
    'panel.chapterBlueprint': '章节蓝图',
    'panel.manuscript': '正文',
    'panel.library': '资料库',
    'panel.localFiles': '资料文件',
    'panel.exports': '导出',
    'panel.enterProject': '进入项目结构',
    'panel.refreshProject': '刷新项目',
    'panel.openProjectChapters': '打开项目后显示章节',
    'workspace.homeSubtitle': '作者为自己打造的 AI 写作平台。AI 可以替你写每一个字，但只有你决定哪一个字留下。',
    'workspace.homeBrandLine': '作者为自己打造的 AI 写作平台。',
    'workspace.homeBrandPromise': 'AI 可以替你写每一个字，但只有你决定哪一个字留下。',
    'workspace.localFirstSubtitle': '本地优先写作工作台。打开或创建项目后，可以直接编辑本地 Markdown 文件。',
    'module.knowledge.description': '管理已确认事实、未回收伏笔、禁写规则和可钉选进本章写作要求的参考资料。',
    'module.knowledge.markdown': '本地 Markdown',
    'module.knowledge.markdownDetail': '像资源管理器一样浏览项目内 Markdown 文件',
    'module.knowledge.facts': '事实库',
    'module.knowledge.factsDetail': '已确认事实、伏笔和禁写规则',
    'module.knowledge.skillsDetail': '管理项目级写作技能',
    'module.knowledge.search': '本地全文检索',
    'module.knowledge.searchDetail': '跨资料、事实和正文检索',
    'module.characters.title': '角色工作台',
    'module.characters.description': '管理人物状态、已确认出场、关系变化和下一次出场边界。',
    'module.characters.overview': '角色总览',
    'module.characters.overviewDetail': '角色资料与完整度概览',
    'module.characters.cards': '角色卡',
    'module.characters.cardsDetail': '按角色整理设定、事实和出场信息',
    'module.characters.relations': '关系图谱',
    'module.characters.relationsDetail': '维护角色之间的关系与变化',
    'module.characters.growth': '成长线',
    'module.characters.growthDetail': '追踪角色目标、转折和阶段变化',
    'module.tasks.description': '当前后台任务和历史任务记录。',
    'module.tasks.current': '当前任务',
    'module.tasks.currentDetail': 'AI 生成、索引、导出等运行状态',
    'module.tasks.history': '任务历史',
    'module.tasks.historyDetail': '查看任务记录与失败原因',
    'module.logs.description': '查看作者确认和系统事件。日志只读，用于回溯，不作为写作入口。',
    'module.logs.author': '作者确认日志',
    'module.logs.authorDetail': '作者手动确认的事实、设定和决策',
    'module.logs.confirmations': '采用确认',
    'module.logs.confirmationsDetail': '候选稿采用、段落替换和撤销摘要',
    'module.logs.system': '系统事件',
    'module.logs.systemDetail': '项目修复、导入、生成和异常记录',
    'module.models.description': '查看 AI 是否可用、默认模型和最近失败原因。',
    'module.models.providers': 'Provider 配置',
    'module.models.providersDetail': '配置 API Key、Base URL 和默认模型',
    'module.models.records': '调用记录',
    'module.models.recordsDetail': '查看请求、响应、耗时、Token 和失败归因',
    'module.models.tests': '连通性测试',
    'module.models.testsDetail': '测试单个或全部 Provider 并刷新记录',
  },
  'en-US': {
    'app.tagline': 'Built for authors. AI drafts, you decide.',
    'app.noProject': 'No project open',
    'tools.label': 'Window tools',
    'tools.search': 'Search',
    'tools.settings': 'Settings',
    'language.label': 'Language',
    'support.button': 'Support',
    'support.title': 'Support Olienta',
    'support.body': 'Olienta is free and open source. If it helps your writing, you can support continued development here.',
    'support.note': 'No popups, no interruptions. You choose the amount before sending.',
    'support.wechatAlt': 'WeChat reward QR code',
    'support.paypalPending': 'Support via PayPal.me.',
    'support.paypalLink': 'Support via PayPal',
    'support.feedback': 'Feedback: olientavip@gmail.com',
    'taskbar.title': 'Tasks',
    'taskbar.emptyTasks': 'No tasks yet. AI workflow progress will appear here.',
    'taskbar.emptyLogs': 'Waiting for task logs.',
    'nav.home': 'Home',
    'nav.project': 'Project',
    'nav.knowledge': 'Knowledge',
    'nav.characters': 'Characters',
    'nav.tasks': 'Tasks',
    'nav.logs': 'Logs',
    'nav.models': 'Models',
    'panel.projectManagement': 'Project Management',
    'panel.newProject': 'New Project',
    'panel.recentProjects': 'Recent Projects',
    'panel.projectStructure': 'Project Structure',
    'panel.storyFrame': 'Story Frame',
    'panel.novelSettings': 'Novel Structure',
    'panel.storyPremise': 'Story Premise',
    'panel.characterMap': 'Character Map',
    'panel.world': 'World',
    'panel.plotOutline': 'Plot Outline',
    'panel.importantScenes': 'Important Scenes',
    'panel.timeline': 'Timeline & Milestones',
    'panel.chapterBlueprint': 'Chapter Blueprint',
    'panel.manuscript': 'Manuscript',
    'panel.library': 'Library',
    'panel.localFiles': 'Library Files',
    'panel.exports': 'Export',
    'panel.enterProject': 'Open project structure',
    'panel.refreshProject': 'Refresh project',
    'panel.openProjectChapters': 'Open a project to show chapters',
    'workspace.homeSubtitle': 'An AI writing platform built by an author for authors. AI can write every word for you, but only you decide which words stay.',
    'workspace.homeBrandLine': 'An AI writing platform built by an author for authors.',
    'workspace.homeBrandPromise': 'AI can write every word for you, but only you decide which words stay.',
    'workspace.localFirstSubtitle': 'A local-first writing workspace. Open or create a project to edit local Markdown files.',
    'module.knowledge.description': 'Manage confirmed facts, open loops, forbidden rules, and reference material pinned into chapter briefs.',
    'module.knowledge.markdown': 'Local Markdown',
    'module.knowledge.markdownDetail': 'Browse project Markdown files like a file manager',
    'module.knowledge.facts': 'Fact Base',
    'module.knowledge.factsDetail': 'Confirmed facts, open loops, and forbidden rules',
    'module.knowledge.skillsDetail': 'Manage project-level writing skills',
    'module.knowledge.search': 'Local Search',
    'module.knowledge.searchDetail': 'Search across materials, facts, and manuscripts',
    'module.characters.title': 'Character Workspace',
    'module.characters.description': 'Manage character state, confirmed appearances, relationship changes, and next-scene boundaries.',
    'module.characters.overview': 'Character Overview',
    'module.characters.overviewDetail': 'Character profiles and completeness overview',
    'module.characters.cards': 'Character Cards',
    'module.characters.cardsDetail': 'Organize settings, facts, and appearance notes by character',
    'module.characters.relations': 'Relationship Map',
    'module.characters.relationsDetail': 'Maintain relationships and changes between characters',
    'module.characters.growth': 'Growth Lines',
    'module.characters.growthDetail': 'Track goals, turns, and stage changes',
    'module.tasks.description': 'Current background tasks and task history.',
    'module.tasks.current': 'Current Tasks',
    'module.tasks.currentDetail': 'AI generation, indexing, export, and other running states',
    'module.tasks.history': 'Task History',
    'module.tasks.historyDetail': 'Review task records and failure causes',
    'module.logs.description': 'Read-only author confirmations and system events for review.',
    'module.logs.author': 'Author Confirmation Log',
    'module.logs.authorDetail': 'Facts, settings, and decisions manually confirmed by the author',
    'module.logs.confirmations': 'Adoption Confirmations',
    'module.logs.confirmationsDetail': 'Candidate adoption, paragraph replacement, and undo summaries',
    'module.logs.system': 'System Events',
    'module.logs.systemDetail': 'Project repair, import, generation, and exception records',
    'module.models.description': 'Check AI availability, default models, and recent failure causes.',
    'module.models.providers': 'API Settings',
    'module.models.providersDetail': 'Configure API Key, Base URL, and default model',
    'module.models.records': 'Call Records',
    'module.models.recordsDetail': 'Review requests, responses, latency, tokens, and failure attribution',
    'module.models.tests': 'Connectivity Tests',
    'module.models.testsDetail': 'Test one or all providers and refresh records',
  },
}

export function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'zh-CN' || stored === 'en-US') return stored
  return window.navigator.language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

export function storeLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, locale)
}

export function translate(locale: Locale, key: TranslationKey) {
  return translations[locale][key] ?? translations['zh-CN'][key]
}

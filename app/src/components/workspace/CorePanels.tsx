import { useEffect, useState, type ReactNode } from 'react'
import { VIEW_TITLES, type WorkspaceProps } from './types'
import { MarkdownDocument } from './EditorPanels'

const FRAMEWORK_PATHS: Record<string, string> = {
  'story-premise': 'framework/02-premise.md',
  characters: 'framework/03-characters.md',
  world: 'framework/05-world.md',
  'plot-outline': 'framework/04-plot-outline.md',
  timeline: 'timeline/events.md',
}

// Smoke contract: "生成草案" action belongs in the AI assistant, not the left framework editor header.

export function PageFrame(props: { title: string; subtitle?: string; hideAssistant?: boolean; assistantDisabled?: boolean; children: ReactNode }) {
  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <h1>{props.title}</h1>
          {props.subtitle && <p>{props.subtitle}</p>}
        </div>
        {!props.hideAssistant && (
          <button
            type="button"
            className="ghost-button assistant-page-button"
            onClick={openAgent}
            disabled={props.assistantDisabled}
            title={props.assistantDisabled ? '当前为示例预览只读项目，请新建或打开本地项目后使用 AI 助手。' : undefined}
          >
            打开助手
          </button>
        )}
      </div>
      {props.children}
    </section>
  )
}

export function HomePanel(props: WorkspaceProps) {
  const selectedRoot = props.form.root_path.trim()
  const projectName = props.form.name.trim()
  const projectRootPreview = selectedRoot && projectName ? previewProjectPath(selectedRoot, projectName) : selectedRoot
  const recentProjects = [
    ...(props.project ? [{ name: props.project.name, root_path: props.project.root_path }] : []),
    ...props.recentProjects,
  ].filter((project, index, projects) => (
    projects.findIndex((item) => item.root_path.replace(/[\\/]+$/, '').toLowerCase() === project.root_path.replace(/[\\/]+$/, '').toLowerCase()) === index
  ))

  return (
    <section className="home-project-dashboard">
      <section className="editor-card project-list-card">
        <div className="card-heading">
          <div>
            <h2>项目列表</h2>
            <p>最近项目</p>
          </div>
          <span className="status-pill">{recentProjects.length}</span>
        </div>
        <div className="home-recent-list">
          {recentProjects.length === 0 && (
            <p className="empty-note">新安装后这里暂时为空。创建或打开项目后，会在这里显示项目名称和位置。</p>
          )}
          {recentProjects.map((project) => (
            <button
              type="button"
              className="recent-project-tile"
              key={project.root_path}
              onClick={() => props.onOpenRecentProject(project.name, project.root_path)}
            >
              <div>
                <strong>{project.name}</strong>
                <small>{project.root_path}</small>
              </div>
              <em>打开</em>
            </button>
          ))}
        </div>
      </section>

      <section className="editor-card ai-onboarding-card">
        <div className="card-heading">
          <div>
            <h2>第一步：装配写作 AI</h2>
            <p>没有可用 Provider 时，生成候选稿、蓝图和助手对话都会停止在配置环节。</p>
          </div>
          <span className="status-pill">AI</span>
        </div>
        <p className="empty-note">推荐先配置 DeepSeek 或本地 Ollama，保存后运行一次测试。API Key 只保存在本机软件设置，不写入小说项目。</p>
        <div className="editor-actions">
          <button type="button" className="primary-button" onClick={props.onOpenModelProviders}>配置 AI Provider</button>
          <button type="button" className="ghost-button" onClick={props.onTestAiProvider}>测试连接</button>
        </div>
      </section>

      <div className="project-action-grid">
        <section className="editor-card project-create-card">
          <div className="card-heading"><h2>新建项目</h2></div>
          <div className="settings-grid project-entry-grid">
            <label>项目名称<input value={props.form.name} onChange={(event) => props.onUpdateForm('name', event.target.value)} /></label>
            <div className="folder-picker-row">
              <div>
                <span>保存位置</span>
                <strong>{projectRootPreview || '尚未选择文件夹'}</strong>
              </div>
              <button className="ghost-button" type="button" onClick={props.onChooseFolder}>选择文件夹</button>
            </div>
          </div>
          <div className="editor-actions">
            <button className="primary-button" onClick={props.onCreateProject} disabled={props.busy}>创建项目</button>
          </div>
        </section>

        <section className="editor-card project-open-card">
          <div className="card-heading">
            <div>
              <h2>打开项目</h2>
              <p>选择电脑里已有的 Olienta 项目文件夹。</p>
            </div>
          </div>
          <button className="folder-open-button" type="button" onClick={props.onOpenProject} disabled={props.busy}>
            <span>打开文件夹</span>
          </button>
        </section>
      </div>
    </section>
  )
}

export function NovelSettingsPanel(props: WorkspaceProps) {
  const [settings, setSettings] = useState(() => parseNovelSettings(cleanAuthorMarkdown(props.frameworkContent), props.project?.name ?? ''))
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(parseNovelSettings(cleanAuthorMarkdown(props.frameworkContent), props.project?.name ?? ''))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [props.frameworkContent, props.project?.name])

  const update = (key: keyof NovelSettingsDraft, value: string) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    props.onChangeFrameworkContent(serializeNovelSettings(next))
  }
  const updateDirection = (direction: NovelDirection) => {
    const next = {
      ...settings,
      direction,
      category: '',
      audience: defaultAudienceForDirection(direction),
    }
    setSettings(next)
    props.onChangeFrameworkContent(serializeNovelSettings(next))
  }
  const categoryOptions = categoryOptionsForDirection(settings.direction)

  return (
    <section className="novel-settings-page">
      <section className="editor-card novel-settings-card">
        <div className="card-heading">
          <div>
            <h2>小说结构</h2>
            <p>定义这部小说的基本信息和全书写作参数。</p>
          </div>
          <div className="editor-actions">
            <button className="ghost-button" type="button" onClick={props.onImportNovelStructureFile} disabled={props.isProjectReadOnly}>导入</button>
            <button className="primary-button" type="button" onClick={props.onSaveFrameworkFile} disabled={props.isProjectReadOnly}>保存</button>
          </div>
        </div>

        <div className="project-form novel-form-grid">
          <SelectField label="创作方向" value={settings.direction} options={DIRECTION_OPTIONS} onChange={(value) => updateDirection(asNovelDirection(value))} />
          <SelectField label="作品分类" value={settings.category} options={categoryOptions} onChange={(value) => update('category', value)} />
          <label>
            细分关键词
            <input value={settings.keywords} onChange={(event) => update('keywords', event.target.value)} placeholder="如：赛博修仙、年代商战、悬疑恋爱" />
          </label>
          <SelectField label="目标读者" value={settings.audience} options={AUDIENCE_OPTIONS} onChange={(value) => update('audience', value)} />
          <SelectField label="故事结构" value={settings.structure} options={STRUCTURE_OPTIONS} onChange={(value) => update('structure', value)} />
          <SelectField label="叙事视角" value={settings.pov} options={POV_OPTIONS} onChange={(value) => update('pov', value)} />
          <label>
            总章数
            <input value={settings.totalChapters} onChange={(event) => update('totalChapters', event.target.value)} placeholder="如：80" />
          </label>
          <label>
            每章字数
            <input value={settings.chapterWords} onChange={(event) => update('chapterWords', event.target.value)} placeholder="如：6000" />
          </label>
        </div>
      </section>

      <VolumeSettingsSection
        volumes={props.volumes}
        totalChapters={Number(settings.totalChapters) || props.project?.chapter_count || 1}
        structure={settings.structure}
        onChange={props.onChangeVolumes}
        onSave={props.onSaveVolumes}
        readOnly={props.isProjectReadOnly}
      />

      <NovelStructureSection
        title="核心大纲"
        description="一段话概括整部小说：谁，在哪里，要做什么。"
        value={settings.outline}
        onChange={(value) => update('outline', value)}
      />
      <NovelStructureSection
        title="世界观 / 初始设定"
        description="故事发生的背景、时代、行业、规则和力量体系。"
        value={settings.world}
        onChange={(value) => update('world', value)}
      />
      <div className="novel-structure-extra-grid">
        <NovelStructureSection
          compact
          title="全局写作要求"
          description="全书级写作规则、禁忌、节奏控制。"
          value={settings.requirements}
          onChange={(value) => update('requirements', value)}
        />
        <NovelStructureSection
          compact
          title="文风配置"
          description="AI 写稿和修稿必须遵守的语言风格。"
          value={settings.style}
          onChange={(value) => update('style', value)}
        />
        <NovelStructureSection
          compact
          title="参考作品"
          description="只记录可参考的体系、风格或机制，不复用原文。"
          value={settings.references}
          onChange={(value) => update('references', value)}
        />
      </div>
    </section>
  )
}

type NovelSettingsDraft = {
  title: string
  direction: NovelDirection
  category: string
  keywords: string
  audience: string
  structure: string
  pov: string
  totalChapters: string
  chapterWords: string
  outline: string
  world: string
  requirements: string
  style: string
  references: string
}

type NovelDirection = '网络文学男频' | '网络文学女频' | '文学小说'

const DIRECTION_OPTIONS: NovelDirection[] = ['网络文学男频', '网络文学女频', '文学小说']

const LITERARY_GENRES = [
  '现实主义小说',
  '历史小说',
  '心理小说',
  '成长小说',
  '世情小说',
  '流浪汉小说',
  '书信体小说',
  '哥特小说',
  '魔幻现实主义',
  '实验小说',
  '侦探小说',
  '悬疑小说',
  '惊悚小说',
  '西部小说',
  '幻想小说',
  '无',
]

const MALE_GENRES = [
  '玄幻',
  '奇幻',
  '武侠',
  '仙侠',
  '都市',
  '现实',
  '军事',
  '历史',
  '游戏',
  '体育',
  '科幻',
  '诸天无限',
  '悬疑',
  '轻小说',
  '短篇',
  '无',
]

const FEMALE_GENRES = [
  '古代言情',
  '仙侠奇缘',
  '现代言情',
  '浪漫青春',
  '玄幻言情',
  '悬疑推理',
  '短篇',
  '科幻空间',
  '游戏竞技',
  '轻小说',
  '现实生活',
  '无',
]

const AUDIENCE_OPTIONS = ['男频读者', '女频读者', '文学读者', '不限']

const STRUCTURE_OPTIONS = ['自由结构', '三幕式', '四卷结构', '五卷结构', '起承转合', '单元剧结构', '多线并进', '压迫流结构']

const POV_OPTIONS = ['第三人称多视角', '第三人称单视角', '第一人称', '全知视角', '双视角', '多视角轮换']

function VolumeSettingsSection(props: {
  volumes: WorkspaceProps['volumes']
  totalChapters: number
  structure: string
  onChange: WorkspaceProps['onChangeVolumes']
  onSave: WorkspaceProps['onSaveVolumes']
  readOnly?: boolean
}) {
  const safeTotal = Math.max(1, Math.floor(props.totalChapters || 1))
  const volumes = props.volumes

  function updateVolume(index: number, patch: Partial<(typeof volumes)[number]>) {
    props.onChange(volumes.map((volume, itemIndex) => (
      itemIndex === index ? { ...volume, ...patch } : volume
    )))
  }

  function updateChapterRange(index: number, key: 'startChapter' | 'endChapter', value: string) {
    const current = volumes[index]
    const fallback = key === 'startChapter' ? current?.startChapter : current?.endChapter
    updateVolume(index, { [key]: clampChapterNumber(value, safeTotal, fallback ?? 1) })
  }

  function addVolume() {
    const last = volumes[volumes.length - 1]
    const startChapter = Math.min(safeTotal, (last?.endChapter ?? 0) + 1)
    props.onChange([
      ...volumes,
      {
        id: `volume-${volumes.length + 1}`,
        title: `第${volumes.length + 1}卷`,
        startChapter,
        endChapter: safeTotal,
        summary: '',
      },
    ])
  }

  function removeVolume(index: number) {
    const next = volumes.filter((_, itemIndex) => itemIndex !== index)
    props.onChange(next)
  }

  function generateVolumes() {
    props.onChange(buildGeneratedVolumes(safeTotal, props.structure))
  }

  return (
    <section className="editor-card volume-settings-card">
      <div className="card-heading">
        <div>
          <h2>分卷设置</h2>
          <p>分卷会保存到 .olienta/volumes.json，并用于章节列表、蓝图上下文和导出卷标题。</p>
        </div>
        <div className="editor-actions">
          <button className="ghost-button" type="button" onClick={generateVolumes} disabled={props.readOnly}>生成分卷</button>
          <button className="ghost-button" type="button" onClick={addVolume} disabled={props.readOnly}>增加卷</button>
          <button className="primary-button" type="button" onClick={() => props.onSave(volumes)} disabled={props.readOnly}>保存分卷</button>
        </div>
      </div>
      <div className="volume-settings-list">
        {volumes.map((volume, index) => (
          <div className="volume-settings-row" key={volume.id || index}>
            <label>
              卷名
              <input value={volume.title} onChange={(event) => updateVolume(index, { title: event.target.value })} disabled={props.readOnly} />
            </label>
            <label>
              起始章
              <input
                type="number"
                min={1}
                max={safeTotal}
                value={volume.startChapter}
                onChange={(event) => updateChapterRange(index, 'startChapter', event.target.value)}
                disabled={props.readOnly}
              />
            </label>
            <label>
              结束章
              <input
                type="number"
                min={1}
                max={safeTotal}
                value={volume.endChapter}
                onChange={(event) => updateChapterRange(index, 'endChapter', event.target.value)}
                disabled={props.readOnly}
              />
            </label>
            <label>
              卷说明
              <input value={volume.summary} onChange={(event) => updateVolume(index, { summary: event.target.value })} placeholder="本卷主要矛盾、转折或阶段目标" disabled={props.readOnly} />
            </label>
            <button className="ghost-button" type="button" onClick={() => removeVolume(index)} disabled={props.readOnly}>删除</button>
          </div>
        ))}
        {volumes.length === 0 && (
          <p className="empty-note">分卷已清空。可以点击“增加卷”手动添加，或点击“生成分卷”重新生成。</p>
        )}
      </div>
    </section>
  )
}

function buildGeneratedVolumes(totalChapters: number, structure: string) {
  const count = inferVolumeCount(structure)
  const safeTotal = Math.max(1, Math.floor(totalChapters || 1))
  const size = Math.ceil(safeTotal / count)
  return Array.from({ length: count }, (_, index) => {
    const startChapter = index * size + 1
    const endChapter = Math.min(safeTotal, (index + 1) * size)
    return {
      id: `volume-${index + 1}`,
      title: defaultVolumeTitle(index, count),
      startChapter,
      endChapter: Math.max(startChapter, endChapter),
      summary: '',
    }
  }).filter((volume) => volume.startChapter <= safeTotal)
}

function inferVolumeCount(structure: string) {
  if (structure.includes('五卷')) return 5
  if (structure.includes('四卷') || structure.includes('起承转合')) return 4
  if (structure.includes('三幕')) return 3
  return 4
}

function defaultVolumeTitle(index: number, count: number) {
  const fourPart = ['第一卷：起', '第二卷：承', '第三卷：转', '第四卷：合']
  if (count === 4) return fourPart[index] ?? `第${index + 1}卷`
  return `第${index + 1}卷`
}

function clampChapterNumber(value: string, totalChapters: number, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(Math.floor(parsed), Math.max(1, totalChapters)))
}

function SelectField(props: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const options = props.value && !props.options.includes(props.value) ? [props.value, ...props.options] : props.options
  return (
    <label>
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">请选择</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function NovelStructureSection(props: {
  title: string
  description: string
  value: string
  compact?: boolean
  onChange: (value: string) => void
}) {
  return (
    <section className={`editor-card novel-structure-card ${props.compact ? 'compact' : ''}`}>
      <div className="card-heading">
        <div>
          <h2>{props.title}</h2>
          <p>{props.description}</p>
        </div>
      </div>
      <textarea
        className={props.compact ? 'novel-structure-small-textarea' : 'novel-structure-textarea'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </section>
  )
}

function parseNovelSettings(content: string, fallbackTitle: string): NovelSettingsDraft {
  const legacyGenre = cleanInlineValue(readInlineValue(content, ['类型', '小说类型']))
  const legacyMaleGenre = cleanInlineValue(readInlineValue(content, ['网络文学男频', '男频分类']))
  const legacyFemaleGenre = cleanInlineValue(readInlineValue(content, ['网络文学女频', '女频分类']))
  const direction = asNovelDirection(
    cleanInlineValue(readInlineValue(content, ['创作方向', '频道方向', '频道'])) ||
    (legacyFemaleGenre && legacyFemaleGenre !== '无' ? '网络文学女频' : '') ||
    (legacyMaleGenre && legacyMaleGenre !== '无' ? '网络文学男频' : '') ||
    (inferOptionFromText(legacyGenre, FEMALE_GENRES) ? '网络文学女频' : '') ||
    (inferOptionFromText(legacyGenre, MALE_GENRES) ? '网络文学男频' : '') ||
    '文学小说',
  )
  return {
    title: cleanInlineValue(readInlineValue(content, ['项目', '作品', '作品名称'])) || fallbackTitle,
    direction,
    category: validOption(
      cleanInlineValue(readInlineValue(content, ['作品分类', '分类'])) ||
      pickCategoryForDirection(direction, legacyMaleGenre, legacyFemaleGenre, legacyGenre, cleanInlineValue(readInlineValue(content, ['文学定位', '严肃文学', '文学小说定位']))),
      categoryOptionsForDirection(direction),
    ),
    keywords: cleanKeywordValue(readInlineValue(content, ['细分关键词', '关键词', '细分类型'])),
    audience: validOption(cleanInlineValue(readInlineValue(content, ['目标读者', '目标受众', '受众'])) || defaultAudienceForDirection(direction), AUDIENCE_OPTIONS),
    structure: validOption(cleanInlineValue(readInlineValue(content, ['故事结构', '结构'])), STRUCTURE_OPTIONS),
    pov: validOption(cleanInlineValue(readInlineValue(content, ['叙事视角', '视角'])), POV_OPTIONS),
    totalChapters: cleanNumberText(readInlineValue(content, ['总章数'])),
    chapterWords: cleanNumberText(readInlineValue(content, ['每章目标字数', '每章字数'])),
    outline: readSection(content, ['核心大纲', '小说概要', '故事梗概', '扩展前提']) || stripSettingHeader(content),
    world: readSection(content, ['世界观 / 初始设定', '世界观', '初始设定']),
    requirements: readSection(content, ['全局写作要求', '写作要求', '前提告诉作者的事']),
    style: readSection(content, ['文风配置', '语言风格', '风格']),
    references: readSection(content, ['参考作品', '参考']),
  }
}

function serializeNovelSettings(settings: NovelSettingsDraft) {
  const genre = compactClassification(settings)
  const lines = [
    '# 小说结构',
    '',
    `项目：${settings.title}`,
    `类型：${genre}`,
    `创作方向：${settings.direction}`,
    `作品分类：${settings.category}`,
    `细分关键词：${settings.keywords}`,
    `目标读者：${settings.audience}`,
    `故事结构：${settings.structure}`,
    `叙事视角：${settings.pov}`,
    `总章数：${settings.totalChapters}`,
    `每章目标字数：${settings.chapterWords}`,
    '',
    '## 核心大纲',
    '',
    settings.outline.trim(),
    '',
    '## 世界观 / 初始设定',
    '',
    settings.world.trim(),
    '',
    '## 全局写作要求',
    '',
    settings.requirements.trim(),
    '',
    '## 文风配置',
    '',
    settings.style.trim(),
    '',
    '## 参考作品',
    '',
    settings.references.trim(),
    '',
  ]
  return lines.join('\n')
}

function compactClassification(settings: NovelSettingsDraft) {
  return [settings.direction, settings.category, settings.keywords]
    .map((item) => item.trim())
    .filter((item) => item && item !== '无')
    .join(' / ')
}

function asNovelDirection(value: string): NovelDirection {
  const normalized = value.trim().toLowerCase()
  if (value === '网络文学女频' || normalized.includes('female') || normalized.includes('women')) return '网络文学女频'
  if (value === '网络文学男频' || normalized.includes('male') || normalized.includes('men')) return '网络文学男频'
  return '文学小说'
}

function categoryOptionsForDirection(direction: NovelDirection) {
  if (direction === '网络文学男频') return MALE_GENRES
  if (direction === '网络文学女频') return FEMALE_GENRES
  return LITERARY_GENRES
}

function defaultAudienceForDirection(direction: NovelDirection) {
  if (direction === '网络文学男频') return '男频读者'
  if (direction === '网络文学女频') return '女频读者'
  return '文学读者'
}

function pickCategoryForDirection(
  direction: NovelDirection,
  maleGenre: string,
  femaleGenre: string,
  legacyGenre: string,
  literary: string,
) {
  if (direction === '网络文学男频') return maleGenre || inferOptionFromText(legacyGenre, MALE_GENRES)
  if (direction === '网络文学女频') return femaleGenre || inferOptionFromText(legacyGenre, FEMALE_GENRES)
  return literary || inferOptionFromText(legacyGenre, LITERARY_GENRES)
}

function inferOptionFromText(text: string, options: string[]) {
  return options.find((option) => text.includes(option) || text.includes(option.replace(/小说$/, ''))) ?? ''
}

function validOption(value: string, options: string[]) {
  return options.includes(value) ? value : ''
}

function cleanNumberText(value: string) {
  const cleaned = cleanInlineValue(value)
  return /^\d+$/.test(cleaned) ? cleaned : ''
}

function cleanKeywordValue(value: string) {
  const cleaned = cleanInlineValue(value)
  if (!cleaned) return ''
  if (/(目标读者|目标受众|受众|故事结构|叙事视角|总章数|每章目标字数|每章字数)[：:]/.test(cleaned)) return ''
  return cleaned
}

function cleanInlineValue(value: string) {
  const cleaned = value.trim()
  if (!cleaned) return ''
  if (/^#{1,6}\s+/.test(cleaned)) return ''
  if (/^(项目|作品|类型|小说类型|创作方向|频道方向|频道|作品分类|分类|文学定位|网络文学男频|男频分类|网络文学女频|女频分类|细分关键词|关键词|细分类型|目标读者|目标受众|受众|故事结构|结构|叙事视角|视角|总章数|每章目标字数|每章字数|核心大纲|世界观|初始设定|全局写作要求|写作要求|文风配置|语言风格|风格|参考作品|参考)[:：]?\s*$/.test(cleaned)) return ''
  return cleaned
}

function readInlineValue(content: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = content.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?\\**${escaped}\\**\\s*[：:]\\s*(.+)`))
    if (match?.[1]) return match[1].trim().replace(/^["“]|["”]$/g, '')
  }
  return ''
}

function readSection(content: string, headings: string[]) {
  const lines = content.split(/\r?\n/)
  for (const heading of headings) {
    const start = lines.findIndex((line) => normalizeHeading(line) === heading)
    if (start >= 0) {
      const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s+/.test(line.trim()))
      return lines.slice(start + 1, end >= 0 ? end : lines.length).join('\n').trim()
    }
  }
  return ''
}

function normalizeHeading(line: string) {
  return line.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim()
}

function stripSettingHeader(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => !/^#\s+/.test(line.trim()) && !/^(项目|作品|类型|小说类型|主语言|总章数|每章目标字数)[：:]/.test(line.trim()))
    .join('\n')
    .trim()
}

export function ContinueWritingPanel(props: WorkspaceProps) {
  return (
    <section className="editor-card continue-writing-panel">
      <div className="card-heading">
        <div>
          <h2>继续写作</h2>
          <p>{props.project ? `${props.project.name} · 第 ${props.selectedChapterId} 章` : '先打开一个作品项目。'}</p>
        </div>
        <span className="status-pill">{props.saveState}</span>
      </div>
      <div className="chapter-chain-steps">
        <article className="chapter-chain-step active">
          <div><strong>当前正文</strong><span>{props.chapterPath}</span></div>
          <p>{props.manuscriptWordCount} 字，保存后进入作者确认链。</p>
        </article>
        <article className="chapter-chain-step draft">
          <div><strong>章节蓝图</strong><span>{props.blueprintPath}</span></div>
          <p>先明确本章事件，再生成候选稿。</p>
        </article>
        <article className="chapter-chain-step confirmed">
          <div><strong>候选稿</strong><span>{props.candidatePath}</span></div>
          <p>AI 输出只进入候选稿，采用前不会覆盖正文。</p>
        </article>
      </div>
      <div className="editor-actions">
        <button type="button" className="primary-button" onClick={() => props.onSelectView('manuscript')}>打开正文</button>
        <button type="button" className="ghost-button" onClick={() => props.onSelectView('chapter-blueprint')}>打开蓝图</button>
        <button type="button" className="ghost-button" onClick={props.onComposeBrief}>生成写作要求</button>
        <button type="button" className="ghost-button" onClick={props.onGenerateCandidate}>生成候选稿</button>
      </div>
    </section>
  )
}

export function FrameworkPanel(props: WorkspaceProps) {
  if (props.activeView === 'timeline') {
    const timelineEvents = cleanAuthorMarkdown(props.timelineEvents)
    const timelineMilestones = cleanAuthorMarkdown(props.timelineMilestones)
    return (
      <section className="timeline-workspace">
        <TimelineSubwayMap eventsContent={timelineEvents} milestonesContent={timelineMilestones} />
        <div className="timeline-editor-grid">
          <MarkdownDocument
            title={VIEW_TITLES.timeline}
            path={props.timelineEventsPath}
            value={timelineEvents}
            onChange={(value) => props.onChangeTimelineEvents(cleanAuthorMarkdown(value))}
            onSave={props.onSaveTimelineEvents}
            readOnly={props.isProjectReadOnly}
            actions={
              <span className="status-pill">
                {props.timelineSettings.enabled ? 'Timeline Pro 已启用' : '普通时间线'}
              </span>
            }
          />
          <MarkdownDocument
            title="时间线里程碑"
            path={props.timelineMilestonesPath}
            value={timelineMilestones}
            onChange={(value) => props.onChangeTimelineMilestones(cleanAuthorMarkdown(value))}
            onSave={props.onSaveTimelineMilestones}
            readOnly={props.isProjectReadOnly}
          />
        </div>
      </section>
    )
  }

  const path = FRAMEWORK_PATHS[props.activeView] ?? props.frameworkPath
  const frameworkContent = cleanAuthorMarkdown(props.frameworkContent)
  return (
    <section className="framework-document-tight">
      <FrameworkDraftStrip {...props} path={path} />
      <MarkdownDocument
        title={VIEW_TITLES[props.activeView] ?? '框架文件'}
        path={path}
        value={frameworkContent}
        onChange={(value) => props.onChangeFrameworkContent(cleanAuthorMarkdown(value))}
        onSave={props.onSaveFrameworkFile}
        readOnly={props.isProjectReadOnly}
        actions={undefined}
      />
    </section>
  )
}

function FrameworkDraftStrip(props: WorkspaceProps & { path: string }) {
  const draftPath = props.frameworkDraftPath
  const draftContent = props.frameworkDraftContent.trim()
  if (!draftContent || !draftBelongsToFramework(draftPath, props.path)) return null
  return (
    <section className="editor-card draft-strip-card">
      <div className="card-heading">
        <div>
          <h2>本目录草稿列表</h2>
          <p>当前有一份 AI 生成草稿，可在右侧助手比对后保存。</p>
        </div>
        <span className="status-pill">1</span>
      </div>
      <div className="draft-strip-list">
        <button type="button" className="draft-strip-item active">
          <strong>{draftPath.split(/[\\/]/).pop() || '当前草稿'}</strong>
          <small>{formatBytes(new Blob([draftContent]).size)}</small>
        </button>
      </div>
    </section>
  )
}

function draftBelongsToFramework(draftPath: string, frameworkPath: string) {
  if (!draftPath) return true
  const stem = frameworkPath.split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? ''
  return !stem || draftPath.includes(`framework/drafts/${stem}-`) || draftPath.includes(`framework/drafts/${stem}.`)
}

type TimelineMapEvent = {
  id: string
  label: string
  lane: TimelineLaneName
  characters: string[]
  milestone: boolean
}

type TimelineLaneName = '时间' | '人物' | '事件'

function TimelineSubwayMap(props: { eventsContent: string; milestonesContent: string }) {
  const events = parseTimelineMapEvents(props.eventsContent, false)
  const milestones = parseTimelineMapEvents(props.milestonesContent, true)
  const nodes = [...events, ...milestones].slice(0, 36)
  const rows = buildTimelineRows(nodes)

  return (
    <section className="timeline-map-panel" aria-label="故事时间轴地图">
      <div className="card-heading timeline-map-heading">
        <div>
          <h2>时间线与里程碑</h2>
          <p>三条轴同步推进：时间、人物、事件。内容变长后自动折成回形针式大 S，向下浏览即可。</p>
        </div>
        <span className="status-pill">节点 {nodes.length}</span>
      </div>
      {nodes.length === 0 ? (
        <p className="empty-note">在时间线 Markdown 中用列表写入事件后，这里会自动生成地图节点。</p>
      ) : (
        <div className="subway-map s-curve-map">
          {rows.map((row, rowIndex) => (
            <section className={`timeline-loop ${rowIndex % 2 === 1 ? 'reverse' : ''}`} key={rowIndex}>
              {buildTimelineLanes(row).map((lane, laneIndex) => (
                <div className={`subway-lane lane-${laneIndex}`} key={`${rowIndex}-${lane.name}`}>
                  <div className="subway-lane-label">{lane.name}</div>
                  <div className="subway-rail" />
                  <div className="subway-node-grid">
                    {lane.nodes.map((node) => (
                      <article
                        className={`subway-node ${node.milestone ? 'milestone' : ''}`}
                        key={node.id}
                      >
                        <span className="subway-dot" />
                        <strong>{node.label}</strong>
                        {node.characters.length > 0 && <small>{node.characters.join(' / ')}</small>}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function parseTimelineMapEvents(content: string, milestone: boolean): TimelineMapEvent[] {
  const rows: TimelineMapEvent[] = []
  let heading = milestone ? '里程碑' : '主线'

  content.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) return
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/)
    if (headingMatch) {
      heading = cleanupTimelineText(headingMatch[1]).slice(0, 12) || heading
      return
    }
    const listMatch = line.match(/^[-*]\s+(.*)$/) ?? line.match(/^\d+[.)]\s+(.*)$/)
    const tableLabel = parseTimelineTableLabel(line)
    if (!listMatch && !tableLabel) return

    const rawLabel = listMatch?.[1] ?? tableLabel ?? ''
    const label = cleanupTimelineText(rawLabel).slice(0, 72)
    if (!label) return
    rows.push({
      id: `${milestone ? 'm' : 'e'}-${index}`,
      label,
      lane: chooseTimelineLane(label, heading, milestone),
      characters: extractTimelineCharacters(rawLabel),
      milestone,
    })
  })

  return rows
}

function parseTimelineTableLabel(line: string) {
  if (!line.startsWith('|') || /^[:|\-\s]+$/.test(line)) return ''
  const cells = line
    .split('|')
    .map((cell) => cleanupTimelineText(cell))
    .filter(Boolean)
  if (cells.length < 2) return ''
  if (cells.some((cell) => /时间|日期|事件|影响|人口|设定|节点/.test(cell))) return ''
  return cells.slice(0, 4).join(' · ')
}

function buildTimelineRows(nodes: TimelineMapEvent[]) {
  const rowSize = 6
  const rows: TimelineMapEvent[][] = []
  for (let index = 0; index < nodes.length; index += rowSize) {
    rows.push(nodes.slice(index, index + rowSize))
  }
  return rows
}

function buildTimelineLanes(nodes: TimelineMapEvent[]) {
  const laneNames: TimelineLaneName[] = ['时间', '人物', '事件']
  return laneNames.map((name) => ({
    name,
    nodes: nodes
      .filter((node) => node.lane === name),
  }))
}

function chooseTimelineLane(label: string, heading: string, milestone: boolean): TimelineLaneName {
  const text = `${heading} ${label}`
  if (milestone || /\d{2,4}年|\d{1,2}月|\d{1,2}日|时间|日期|时代|纪年|节点|里程碑/.test(text)) return '时间'
  if (/人物|角色|关系|成长|转变|出场|退场|@|【/.test(text)) return '人物'
  return '事件'
}

function extractTimelineCharacters(text: string) {
  const names = new Set<string>()
  for (const match of text.matchAll(/【([^】]{1,12})】/g)) names.add(match[1].trim())
  for (const match of text.matchAll(/@([\p{Script=Han}A-Za-z0-9_-]{1,12})/gu)) names.add(match[1].trim())
  const roleMatch = text.match(/人物[：:]\s*([^，。；;\n]+)/)
  if (roleMatch) {
    roleMatch[1].split(/[、,，/]/).forEach((name) => {
      const cleaned = name.trim()
      if (cleaned) names.add(cleaned)
    })
  }
  return Array.from(names).slice(0, 3)
}

function cleanupTimelineText(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanAuthorMarkdown(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/(^|\n)\\([-*]\s+)/g, '$1$2')
    .replace(/\\([#>*_`])/g, '$1')
}

export function BlueprintPanel(props: WorkspaceProps) {
  return (
    <section className="blueprint-workspace split-editor-layout">
      <div className="blueprint-editor-stack">
        <BlueprintOverviewCard {...props} />
        <BlueprintDraftStrip {...props} />
        <MarkdownDocument
          title="作者输入"
          path={props.authorInputPath}
          value={props.authorInput}
          onChange={props.onChangeAuthorInput}
          onSave={props.onSaveAuthorInput}
          readOnly={props.isProjectReadOnly}
          actions={
            props.isProjectReadOnly ? undefined : <button className="ghost-button" onClick={props.onGenerateBlueprintDraft}>生成蓝图草稿</button>
          }
        />
        <MarkdownDocument
          title="章节蓝图"
          path={props.blueprintPath}
          value={props.blueprint}
          onChange={props.onChangeBlueprint}
          onSave={props.onSaveBlueprint}
          readOnly={props.isProjectReadOnly}
          actions={
            props.isProjectReadOnly ? undefined : <>
              <button className="ghost-button" onClick={props.onComposeBrief}>装配任务书</button>
              <button className="ghost-button" onClick={props.onRegenerateFollowingBlueprints}>重生成后续</button>
              <button className="ghost-button" onClick={props.onRegenerateAllBlueprints}>重生成全部</button>
            </>
          }
        />
      </div>
    </section>
  )
}

function BlueprintOverviewCard(props: WorkspaceProps) {
  return (
    <section className="editor-card blueprint-overview-card">
      <div className="card-heading">
        <div>
          <h2>全书蓝图</h2>
          <p>导入一个多章蓝图文件，系统会按“第 N 章”标题拆分并逐章保存。</p>
        </div>
        <span className="status-pill">{props.chapters.length} 章</span>
      </div>
      <div className="blueprint-overview-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={props.onImportBlueprintBundle}
          disabled={props.isProjectReadOnly}
          title="从一个 Markdown/TXT/Word 文件中按“第 N 章”标题切分并导入蓝图。"
        >
          导入多章蓝图
        </button>
      </div>
    </section>
  )
}

function BlueprintDraftStrip(props: WorkspaceProps) {
  return (
    <section className="editor-card draft-strip-card">
      <div className="card-heading">
        <div>
          <h2>本章蓝图草稿列表</h2>
          <span className="sr-only">蓝图历史</span>
          <p>选择草稿后可预览，并恢复到左侧蓝图编辑器。</p>
        </div>
        <span className="status-pill">{props.blueprintHistory.length}</span>
      </div>
      <div className="draft-strip-list">
        {props.blueprintHistory.length === 0 && <p className="empty-note">还没有保存过蓝图草稿。</p>}
        {props.blueprintHistory.map((item) => (
          <button
            type="button"
            className={`draft-strip-item ${item.relative_path === props.selectedBlueprintHistoryPath ? 'active' : ''}`}
            key={item.relative_path}
            onClick={() => props.onLoadBlueprintHistory(item.relative_path)}
          >
            <strong>{item.name}</strong>
            <small>{formatBytes(item.bytes)}</small>
          </button>
        ))}
      </div>
      {props.selectedBlueprintHistoryPath && (
        <div className="draft-strip-actions">
          <span>{props.selectedBlueprintHistoryPath}</span>
          <button
            type="button"
            className="ghost-button"
            disabled={!props.blueprintHistoryPreview.trim()}
            onClick={() => props.onChangeBlueprint(props.blueprintHistoryPreview)}
          >
            恢复到编辑器
          </button>
        </div>
      )}
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

function previewProjectPath(rootPath: string, projectName: string) {
  const base = rootPath.trim().replace(/[\\/]+$/, '')
  const folder = projectName
    .trim()
    .split('')
    .filter((char) => !'<>:"/\\|?*'.includes(char) && char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!base || !folder) return rootPath
  const normalizedBase = base.replaceAll('\\', '/').toLowerCase()
  if (normalizedBase.endsWith(`/${folder.toLowerCase()}`)) return base
  return `${base}\\${folder}`
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [, , sourceRoot = 'D:\\windsurf\\小说\\无痛剥离', targetRoot = 'D:\\windsurf\\olienta-projects\\wutongboli-sample-project'] = process.argv

const mappings = [
  ['第1号文件_故事前提.md', 'framework/02-premise.md'],
  ['第2号文件_世界观.md', 'framework/05-world.md'],
  ['第3号文件_角色图谱.md', 'framework/03-characters.md'],
  ['第4号文件_情节大纲.md', 'framework/04-plot-outline.md'],
  ['第5号文件_本小说的特色.md', 'framework/06-style.md'],
  ['第6号文件_时间轴及里程碑.md', 'timeline/events.md'],
]

const chapterSources = [
  ['001', '第01章 三十万索赔.md', '三十万索赔'],
  ['002', '第02章 抬价.md', '抬价'],
  ['003', '第03章 上桌.md', '上桌'],
]

for (const directory of [
  'framework',
  'blueprints/chapters',
  'blueprints/history',
  'manuscript/chapters',
  'manuscript/author-input',
  'manuscript/candidates',
  'manuscript/candidates/history',
  'manuscript/copies',
  'facts',
  'knowledge/markdown',
  'knowledge/search',
  'characters/cards',
  'characters/history',
  'timeline',
  'timeline/history',
  'skills/selected',
  'tasks',
  'logs/model-calls',
  'models',
  'exports',
  '.olienta',
  '.olienta-events/commits',
]) {
  await mkdir(join(targetRoot, directory), { recursive: true })
}

await writeFile(
  join(targetRoot, 'project.yaml'),
  [
    'name: 无痛剥离',
    'language: zh-CN',
    'template: literary',
    'storage: local-files',
    'chapter_count: 34',
    'target_words_per_chapter: 10000',
    '',
  ].join('\n'),
  'utf8',
)

await writeFile(
  join(targetRoot, 'framework/01-setting.md'),
  '# 基础设定\n\n项目：无痛剥离\n\n类型：现实主义长篇 / 都市情感 / 医美行业\n\n主语言：中文\n\n总章数：34\n\n每章目标字数：10000\n\n从《无痛剥离》测试资料导入。基础设定第一版保持简单，由作者手写确认。\n',
  'utf8',
)

for (const [sourceName, targetRelativePath] of mappings) {
  const content = await readFile(join(sourceRoot, sourceName), 'utf8')
  await writeFile(join(targetRoot, targetRelativePath), content, 'utf8')
}

const skillSource = join(sourceRoot, 'SKILL_shenzhen-desire-realism.md')
const skillContent = await readFile(skillSource, 'utf8')
await writeFile(join(targetRoot, 'skills/selected/SKILL_shenzhen-desire-realism.md'), skillContent, 'utf8')

for (let chapter = 1; chapter <= 34; chapter += 1) {
  const id = `${chapter}`.padStart(3, '0')
  await writeFile(
    join(targetRoot, `blueprints/chapters/${id}.md`),
    `# 第${chapter}章 蓝图\n\n## 本章目标\n\n## 必须发生\n\n## 禁止提前发生\n\n## 作者确认\n\n`,
    'utf8',
  )
  await writeFile(
    join(targetRoot, `manuscript/author-input/${id}.md`),
    `# 第${chapter}章 作者输入\n\n`,
    'utf8',
  )
  await writeFile(
    join(targetRoot, `manuscript/candidates/${id}.md`),
    '',
    'utf8',
  )
}

for (let chapter = 1; chapter <= 34; chapter += 1) {
  const id = `${chapter}`.padStart(3, '0')
  const source = chapterSources.find(([sourceId]) => sourceId === id)
  if (source) {
    const [, fileName] = source
    const content = await readFile(join(sourceRoot, '草稿', fileName), 'utf8')
    await writeFile(join(targetRoot, `manuscript/chapters/${id}.md`), content, 'utf8')
  } else {
    await writeFile(join(targetRoot, `manuscript/chapters/${id}.md`), `# 第${chapter}章 未命名\n\n`, 'utf8')
  }
}

await writeFile(
  join(targetRoot, 'facts/confirmed-facts.md'),
  '# 已确认事实\n\n- 《无痛剥离》发生在 2017 到 2024 年的深圳医美行业。\n- 故事围绕性、爱、婚姻、商业与时代压力的剥离展开。\n',
  'utf8',
)
await writeFile(join(targetRoot, 'facts/author-confirmation.md'), '# 作者确认记录\n\n', 'utf8')
await writeFile(join(targetRoot, 'facts/open-loops.md'), '# 未闭合伏笔\n\n', 'utf8')
await writeFile(join(targetRoot, 'facts/forbidden-rules.md'), '# 禁止违背规则\n\n', 'utf8')
await writeFile(join(targetRoot, 'knowledge/README.md'), '# 知识库\n\n项目知识库入口。事实、Skill、本地 Markdown 与检索索引都保存为普通本地文件。\n', 'utf8')
await writeFile(join(targetRoot, 'knowledge/markdown/README.md'), '# 本地 Markdown\n\n', 'utf8')
await writeFile(join(targetRoot, 'knowledge/search/README.md'), '# 语义检索\n\n', 'utf8')
await writeFile(join(targetRoot, 'characters/cards/README.md'), '# 角色卡\n\n', 'utf8')
await writeFile(join(targetRoot, 'characters/relations.md'), '# 关系图谱\n\n', 'utf8')
await writeFile(join(targetRoot, 'characters/growth.md'), '# 角色成长线\n\n', 'utf8')
await writeFile(join(targetRoot, 'timeline/milestones.md'), '# 里程碑\n\n', 'utf8')
await writeFile(join(targetRoot, 'tasks/current.json'), '[]\n', 'utf8')
await writeFile(join(targetRoot, 'tasks/history.jsonl'), '', 'utf8')
await writeFile(join(targetRoot, 'logs/author-confirmation.md'), '# 作者确认日志\n\n', 'utf8')
await writeFile(join(targetRoot, 'logs/system-events.jsonl'), '', 'utf8')
await writeFile(join(targetRoot, 'logs/model-calls/README.md'), '# 模型调用记录\n\n', 'utf8')
await writeFile(join(targetRoot, 'models/README.md'), '# 模型调用\n\nProvider 配置保存在 .olienta/ai-providers.json。\n', 'utf8')

await writeFile(
  join(targetRoot, '.olienta/ai-providers.json'),
  `${JSON.stringify([
    {
      id: 'openai-compatible-default',
      name: 'OpenAI-compatible',
      kind: 'OpenAI-compatible',
      enabled: false,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      contextWindow: 128000,
      temperature: 0.7,
      stream: false,
      useCases: ['chapter', 'blueprint', 'framework'],
    },
  ], null, 2)}\n`,
  'utf8',
)
await writeFile(join(targetRoot, '.olienta/timeline-settings.json'), '{"enabled":false,"conflictCheck":false,"storage":"local-files"}\n', 'utf8')
await writeFile(join(targetRoot, '.olienta/tasks.json'), '[]\n', 'utf8')
await writeFile(join(targetRoot, '.olienta/disabled-skills.json'), '[]\n', 'utf8')
await writeFile(join(targetRoot, '.olienta/temporary-skills.json'), '[]\n', 'utf8')

console.log(`Imported ${mappings.length} framework/timeline files, ${chapterSources.length} real chapters, 34 chapter shells and 1 skill into ${targetRoot}`)

const baseUrl = new URL(process.argv[2] ?? process.env.OLIENTA_SMOKE_URL ?? 'http://localhost:1420')

const checks = []
const sourceContracts = [
  {
    path: '/src/App.tsx',
    includes: ['请选择或填写一个软件目录外的作品文件夹', '小说设置', '等待项目', 'adoptCandidateIntoManuscript', 'cancelCandidateGeneration'],
  },
  {
    path: '/src/components/ProjectPanel.tsx',
    includes: ['项目结构', '知识库', '章节蓝图', '打开项目后显示章节'],
  },
  {
    path: '/src/components/Workspace.tsx',
    includes: ['本地优先写作工作台', 'Olienta workspace'],
  },
  {
    path: '/src/components/workspace/CorePanels.tsx',
    includes: [
      '创建项目',
      '小说设置',
      '章节蓝图',
      '作者输入',
      '蓝图历史',
      '重生成后续',
      '生成草案',
      'onSaveFrameworkFile',
      'onSaveTimelineEvents',
    ],
  },
  {
    path: '/src/components/workspace/EditorPanels.tsx',
    includes: ['候选稿与正文对比', '候选稿新增段落', '正文独有段落', '逐字差异预览', '插入光标', '取消生成', 'onChangeManuscriptSelection', 'compareParagraphs', 'compareInlineDiff', 'DiffPreviewList', 'applyMarkdownAction', 'htmlToMarkdown', 'renderMarkdownPreview', 'markdownActionForKey'],
  },
  {
    path: '/src/components/workspace/DocumentPanels.tsx',
    includes: ['章节任务书', 'writingBriefPath', 'onSaveModuleMarkdownFile', '取消生成', '导出', '选中章节', 'exportSelected', '模型调用', 'PROVIDER_USE_CASES', '导出 JSON', '导入 JSON', 'skill-meta-row', 'formatSkillCategory', 'formatSkillTag', 'buildProviderExportJson', '导出 JSON 默认不包含密钥'],
  },
  {
    path: '/src/components/workspace/KnowledgePanels.tsx',
    includes: ['本地全文检索', '角色卡', '已确认事实', '禁止违背', 'forbiddenRulesPath', 'onSaveFrameworkFile', 'onChangeFrameworkContent'],
  },
]

function ok(label, detail = '') {
  checks.push({ label, detail, ok: true })
}

function fail(label, detail = '') {
  checks.push({ label, detail, ok: false })
}

async function fetchText(url) {
  const response = await fetch(url)
  const text = await response.text()
  return { response, text }
}

function resourceUrlsFromHtml(html) {
  const urls = new Set()
  const patterns = [
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  ]

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = match[1]
      if (!value || value.startsWith('http')) continue
      urls.add(new URL(value, baseUrl).toString())
    }
  }

  return Array.from(urls)
}

try {
  const { response, text: html } = await fetchText(baseUrl)
  if (response.ok) ok('html status', `${response.status} ${response.statusText}`)
  else fail('html status', `${response.status} ${response.statusText}`)

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) ok('html content-type', contentType)
  else fail('html content-type', contentType || 'missing')

  if (html.trim().length > 0) ok('html body', `${html.length} bytes`)
  else fail('html body', 'empty')

  if (html.includes('id="root"')) ok('root mount', '#root found')
  else fail('root mount', '#root missing')

  if (html.includes('<html lang="zh-CN">')) ok('document language', 'zh-CN')
  else fail('document language', 'zh-CN missing')

  if (html.includes('<title>Olienta Writer</title>')) ok('document title', 'Olienta Writer')
  else fail('document title', 'unexpected or missing title')

  const resources = resourceUrlsFromHtml(html)
  if (resources.length > 0) ok('entry resources', `${resources.length} linked resource(s)`)
  else fail('entry resources', 'no script/link resources discovered')

  for (const resourceUrl of resources) {
    const resourceResponse = await fetch(resourceUrl)
    const path = new URL(resourceUrl).pathname
    if (resourceResponse.ok) ok(`resource ${path}`, `${resourceResponse.status}`)
    else fail(`resource ${path}`, `${resourceResponse.status} ${resourceResponse.statusText}`)
  }

  if (html.includes('vite-error-overlay')) fail('vite overlay marker', 'overlay marker present in HTML')
  else ok('vite overlay marker', 'not present')

  for (const contract of sourceContracts) {
    const sourceUrl = new URL(contract.path, baseUrl)
    const { response: sourceResponse, text: source } = await fetchText(sourceUrl)
    if (!sourceResponse.ok) {
      fail(`source ${contract.path}`, `${sourceResponse.status} ${sourceResponse.statusText}`)
      continue
    }

    ok(`source ${contract.path}`, `${source.length} bytes`)
    for (const expected of contract.includes) {
      if (source.includes(expected)) ok(`copy ${contract.path}`, expected)
      else fail(`copy ${contract.path}`, `missing "${expected}"`)
    }
  }
} catch (error) {
  fail('dev server reachable', error instanceof Error ? error.message : String(error))
}

for (const check of checks) {
  const prefix = check.ok ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${check.label}${check.detail ? ` - ${check.detail}` : ''}`)
}

const failed = checks.filter((check) => !check.ok)
if (failed.length > 0) {
  console.error(`Smoke check failed: ${failed.length} failed, ${checks.length} total.`)
  process.exit(1)
}

console.log(`Smoke check passed: ${checks.length} checks.`)

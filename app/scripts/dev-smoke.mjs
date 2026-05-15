const baseUrl = new URL(process.argv[2] ?? process.env.OLIENTA_SMOKE_URL ?? 'http://localhost:1420')

const checks = []

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

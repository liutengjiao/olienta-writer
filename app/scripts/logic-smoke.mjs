import {
  applyMarkdownAction,
  cleanPastedText,
  compareInlineDiff,
  compareParagraphs,
  countParagraphs,
  estimateTextUnits,
  markdownActionForKey,
  replaceSelection,
} from '../src/lib/editorLogic.ts'
import { summarizeModelCallHistory } from '../src/lib/modelCallLogic.ts'
import { buildProviderExportJson } from '../src/lib/providerLogic.ts'

const checks = []

function ok(label, detail = '') {
  checks.push({ label, detail, ok: true })
}

function fail(label, detail = '') {
  checks.push({ label, detail, ok: false })
}

function expect(label, condition, detail = '') {
  if (condition) ok(label, detail)
  else fail(label, detail)
}

const bold = applyMarkdownAction('正文内容', 0, 2, 'bold')
expect('markdown bold wraps selection', bold.value === '**正文**内容', bold.value)
expect('markdown bold keeps selected text range', bold.selectionStart === 2 && bold.selectionEnd === 4)

const heading = applyMarkdownAction('第一行\n第二行', 0, 0, 'h2')
expect('markdown heading prefixes current line', heading.value.startsWith('## 第一行'), heading.value)

const cleaned = applyMarkdownAction('一  \n\n\n二\t\n', 0, 0, 'clean')
expect('markdown clean normalizes blank lines', cleaned.value === '一\n\n二\n', JSON.stringify(cleaned.value))

const pasted = cleanPastedText(' A  \r\n B\t ')
expect('paste clean normalizes line endings', pasted === 'A\n B', JSON.stringify(pasted))

const replaced = replaceSelection('abc', 1, 2, 'XYZ')
expect('replaceSelection replaces exact range', replaced.value === 'aXYZc' && replaced.selectionStart === 4)

expect('shortcut ctrl+b maps to bold', markdownActionForKey({ key: 'b', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }) === 'bold')
expect('shortcut tab maps to list', markdownActionForKey({ key: 'Tab', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }) === 'list')

const paragraphDiff = compareParagraphs('共同段落\n\n新增段落', '共同段落\n\n旧段落')
expect('paragraph diff detects candidate-only paragraph', paragraphDiff.candidateOnly.includes('新增段落'))
expect('paragraph diff detects manuscript-only paragraph', paragraphDiff.manuscriptOnly.includes('旧段落'))
expect('paragraph diff counts shared paragraph', paragraphDiff.sharedCount === 1)

const inlineDiff = compareInlineDiff('他去了深圳新店', '他去了深圳旧店')
expect('inline diff detects additions', inlineDiff.addedUnits > 0, JSON.stringify(inlineDiff))
expect('inline diff detects removals', inlineDiff.removedUnits > 0, JSON.stringify(inlineDiff))

expect('text unit estimate counts CJK and latin words', estimateTextUnits('深圳 clinic 2024') === 4)
expect('paragraph count ignores empty blocks', countParagraphs('一\n\n\n二\n') === 2)

const exported = buildProviderExportJson(JSON.stringify([
  {
    id: 'p1',
    name: 'Provider',
    apiKey: 'sk-secret',
    apiKeyEncrypted: 'olienta:v1:abc',
    model: 'm',
    contextWindow: 128000,
    maxTokens: 4096,
    timeoutSeconds: 45,
  },
]))
expect('provider export strips plaintext key', !exported.includes('sk-secret'), exported)
expect('provider export strips encrypted key', !exported.includes('apiKeyEncrypted'), exported)
expect('provider export leaves empty key placeholder', exported.includes('"apiKey": ""'), exported)
expect('provider export keeps runtime controls', exported.includes('"maxTokens": 4096') && exported.includes('"timeoutSeconds": 45'), exported)

const modelCallSummary = summarizeModelCallHistory(`# 模型调用记录

## candidate-draft

- status: ok
- provider: Chapter Provider
- durationMs: 1200
- totalTokens: 300

## provider-test

- status: failed
- provider: Broken Provider
- durationMs: -
- totalTokens: -

## framework-draft

- status: ok
- provider: Framework Provider
- durationMs: 800
- totalTokens: 100
`)
expect('model call summary counts calls', modelCallSummary.callCount === 3, JSON.stringify(modelCallSummary))
expect('model call summary counts failures', modelCallSummary.failedCount === 1, JSON.stringify(modelCallSummary))
expect('model call summary averages duration', modelCallSummary.averageDurationMs === 1000, JSON.stringify(modelCallSummary))
expect('model call summary totals tokens', modelCallSummary.totalTokens === 400, JSON.stringify(modelCallSummary))

for (const check of checks) {
  const prefix = check.ok ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${check.label}${check.detail ? ` - ${check.detail}` : ''}`)
}

const failed = checks.filter((check) => !check.ok)
if (failed.length > 0) {
  console.error(`Logic smoke failed: ${failed.length} failed, ${checks.length} total.`)
  process.exit(1)
}

console.log(`Logic smoke passed: ${checks.length} checks.`)

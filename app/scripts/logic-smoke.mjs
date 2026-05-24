import {
  adoptCandidateIntoManuscript,
  applyMarkdownAction,
  candidateTextForAdoption,
  cleanPastedText,
  compareInlineDiff,
  compareParagraphs,
  compareSimilarParagraphs,
  countParagraphs,
  estimateTextUnits,
  findKnowledgeHitsForParagraph,
  markdownActionForKey,
  replaceTextRange,
  replaceSelection,
} from '../src/lib/editorLogic.ts'
import { classifyModelCallFailure, estimateModelCallCost, filterModelCallEntries, parseModelCallHistory, summarizeModelCallCosts, summarizeModelCallFailures, summarizeModelCallHistory, summarizeModelCallProviders, summarizeModelCallTasks } from '../src/lib/modelCallLogic.ts'
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

const rangeReplaced = replaceTextRange('正文旧段落结尾', '新段落', { start: 2, end: 5 })
expect('replaceTextRange replaces bounded range', rangeReplaced.value === '正文新段落结尾', rangeReplaced.value)
expect('replaceTextRange selects replacement', rangeReplaced.selectionStart === 2 && rangeReplaced.selectionEnd === 5, JSON.stringify(rangeReplaced))

const insertedCandidate = adoptCandidateIntoManuscript('开头\n\n结尾', '新增段落', 'insert', { start: 2, end: 2 })
expect('candidate insert preserves surrounding text', insertedCandidate.value === '开头\n\n新增段落\n\n结尾', insertedCandidate.value)
expect('candidate insert selects inserted text', insertedCandidate.selectionStart === 4 && insertedCandidate.selectionEnd === 8, JSON.stringify(insertedCandidate))

const replacedSelectionCandidate = adoptCandidateIntoManuscript('开头旧内容结尾', '新内容', 'insert', { start: 2, end: 5 })
expect('candidate insert replaces selected manuscript range', replacedSelectionCandidate.value === '开头\n\n新内容\n\n结尾', replacedSelectionCandidate.value)

const appendedCandidate = adoptCandidateIntoManuscript('正文', '\n候选', 'append', null)
expect('candidate append separates paragraphs', appendedCandidate.value === '正文\n\n候选', appendedCandidate.value)

expect('candidate selected text is adopted first', candidateTextForAdoption('第一段\n\n第二段', { start: 5, end: 8 }) === '第二段')
expect('candidate empty selection falls back to full draft', candidateTextForAdoption('第一段', { start: 1, end: 1 }) === '第一段')

expect('shortcut ctrl+b maps to bold', markdownActionForKey({ key: 'b', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }) === 'bold')
expect('shortcut tab maps to list', markdownActionForKey({ key: 'Tab', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }) === 'list')

const paragraphDiff = compareParagraphs('共同段落\n\n新增段落', '共同段落\n\n旧段落')
expect('paragraph diff detects candidate-only paragraph', paragraphDiff.candidateOnly.includes('新增段落'))
expect('paragraph diff detects manuscript-only paragraph', paragraphDiff.manuscriptOnly.includes('旧段落'))
expect('paragraph diff counts shared paragraph', paragraphDiff.sharedCount === 1)

const similarParagraphs = compareSimilarParagraphs('他去了深圳新店\n\n完全新增', '他去了深圳旧店\n\n完全无关')
expect('similar paragraph diff pairs close rewrites', similarParagraphs[0]?.candidate === '他去了深圳新店' && similarParagraphs[0]?.manuscript === '他去了深圳旧店', JSON.stringify(similarParagraphs[0]))
expect('similar paragraph diff includes inline changes', (similarParagraphs[0]?.inlineDiff.addedUnits ?? 0) > 0 && (similarParagraphs[0]?.inlineDiff.removedUnits ?? 0) > 0, JSON.stringify(similarParagraphs[0]?.inlineDiff))

const knowledgeHits = findKnowledgeHitsForParagraph('他去了深圳新店，并提到还没有回收雨夜承诺。', {
  confirmedFacts: '- 深圳新店已经开业\n- 北京旧店已经关闭',
  openLoops: '- 雨夜承诺尚未回收',
  forbiddenRules: '- 不得写成上海门店',
})
expect('knowledge hits include related fact', knowledgeHits.some((hit) => hit.kind === 'fact' && hit.text.includes('深圳新店')), JSON.stringify(knowledgeHits))
expect('knowledge hits include related loop', knowledgeHits.some((hit) => hit.kind === 'loop' && hit.text.includes('雨夜承诺')), JSON.stringify(knowledgeHits))
expect('knowledge hits ignore unrelated rule', !knowledgeHits.some((hit) => hit.kind === 'rule'), JSON.stringify(knowledgeHits))

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
    inputPricePerMillionTokens: 0.15,
    outputPricePerMillionTokens: 0.6,
  },
]))
expect('provider export strips plaintext key', !exported.includes('sk-secret'), exported)
expect('provider export strips encrypted key', !exported.includes('apiKeyEncrypted'), exported)
expect('provider export leaves empty key placeholder', exported.includes('"apiKey": ""'), exported)
expect('provider export keeps runtime controls', exported.includes('"maxTokens": 4096') && exported.includes('"timeoutSeconds": 45'), exported)
expect('provider export keeps pricing controls', exported.includes('"inputPricePerMillionTokens": 0.15') && exported.includes('"outputPricePerMillionTokens": 0.6'), exported)

const modelCallHistory = `# 模型调用记录

## candidate-draft

- status: ok
- provider: Chapter Provider
- promptSummary: chapter brief and pinned facts
- retryAttempts: 1
- retryReason: provider returned HTTP 500
- attemptDurationsMs: 120,180
- durationMs: 1200
- promptTokens: 100
- completionTokens: 200
- totalTokens: 300

## provider-test

- status: failed
- provider: Broken Provider
- durationMs: -
- totalTokens: -
- message: unauthorized

## provider-test

- status: failed
- provider: Broken Provider
- durationMs: -
- totalTokens: -
- message: timeout

## framework-draft

- status: ok
- provider: Framework Provider
- durationMs: 800
- promptTokens: 40
- completionTokens: 60
- totalTokens: 100
`
const modelCallSummary = summarizeModelCallHistory(modelCallHistory)
const modelCallEntries = parseModelCallHistory(modelCallHistory)
const failedProviderCalls = filterModelCallEntries(modelCallEntries, { status: 'failed', query: 'broken' })
const chapterProviderCalls = filterModelCallEntries(modelCallEntries, { provider: 'Chapter Provider' })
const timeoutCalls = filterModelCallEntries(modelCallEntries, { failureKind: 'timeout' })
const candidateCost = estimateModelCallCost(modelCallEntries[0], [{ name: 'Chapter Provider', inputPricePerMillionTokens: 1, outputPricePerMillionTokens: 2 }])
const costSummary = summarizeModelCallCosts(modelCallEntries, [{ name: 'Chapter Provider', inputPricePerMillionTokens: 1, outputPricePerMillionTokens: 2 }])
const failureSummary = summarizeModelCallFailures(modelCallEntries)
const providerSummary = summarizeModelCallProviders(modelCallEntries, [{ name: 'Chapter Provider', inputPricePerMillionTokens: 1, outputPricePerMillionTokens: 2 }])
const taskSummary = summarizeModelCallTasks(modelCallEntries, [{ name: 'Chapter Provider', inputPricePerMillionTokens: 1, outputPricePerMillionTokens: 2 }])
expect('model call summary counts calls', modelCallSummary.callCount === 4, JSON.stringify(modelCallSummary))
expect('model call summary counts failures', modelCallSummary.failedCount === 2, JSON.stringify(modelCallSummary))
expect('model call summary averages duration', modelCallSummary.averageDurationMs === 1000, JSON.stringify(modelCallSummary))
expect('model call summary totals tokens', modelCallSummary.totalTokens === 400, JSON.stringify(modelCallSummary))
expect('model call parser keeps entry fields', modelCallEntries[0]?.provider === 'Chapter Provider' && modelCallEntries[0]?.durationMs === 1200, JSON.stringify(modelCallEntries[0]))
expect('model call parser keeps prompt summary', modelCallEntries[0]?.promptSummary === 'chapter brief and pinned facts', JSON.stringify(modelCallEntries[0]))
expect('model call parser keeps retry attempts', modelCallEntries[0]?.retryAttempts === 1, JSON.stringify(modelCallEntries[0]))
expect('model call parser keeps retry reason', modelCallEntries[0]?.retryReason === 'provider returned HTTP 500', JSON.stringify(modelCallEntries[0]))
expect('model call parser keeps attempt durations', modelCallEntries[0]?.attemptDurationsMs === '120,180', JSON.stringify(modelCallEntries[0]))
expect('model call filter matches status and query', failedProviderCalls.length === 2 && failedProviderCalls[0].task === 'provider-test', JSON.stringify(failedProviderCalls))
expect('model call filter matches provider exactly', chapterProviderCalls.length === 1 && chapterProviderCalls[0].task === 'candidate-draft', JSON.stringify(chapterProviderCalls))
expect('model call filter matches failure kind', timeoutCalls.length === 1 && timeoutCalls[0].message === 'timeout', JSON.stringify(timeoutCalls))
expect('model call cost estimates prompt and completion tokens', Math.abs((candidateCost ?? 0) - 0.0005) < 0.000001, String(candidateCost))
expect('model call cost summary counts priced and unpriced calls', costSummary.pricedCallCount === 1 && costSummary.unpricedCallCount === 3 && Math.abs(costSummary.estimatedCostUsd - 0.0005) < 0.000001, JSON.stringify(costSummary))
expect('model call failure summary groups providers', failureSummary.providerGroups[0]?.provider === 'Broken Provider' && failureSummary.providerGroups[0]?.count === 2, JSON.stringify(failureSummary))
expect('model call failure summary keeps recent reason', failureSummary.recentFailures[0]?.message === 'timeout', JSON.stringify(failureSummary.recentFailures))
expect('model call failure summary groups reasons', failureSummary.reasonGroups.some((group) => group.kind === 'auth' && group.count === 1) && failureSummary.reasonGroups.some((group) => group.kind === 'timeout' && group.count === 1), JSON.stringify(failureSummary.reasonGroups))
expect('model call failure classifier detects auth', classifyModelCallFailure(modelCallEntries[1]).kind === 'auth', JSON.stringify(modelCallEntries[1]))
expect('model call failure classifier gives advice', classifyModelCallFailure(modelCallEntries[2]).advice.includes('超时秒数'), classifyModelCallFailure(modelCallEntries[2]).advice)
expect('model call provider summary orders by call count', providerSummary[0]?.provider === 'Broken Provider' && providerSummary[0]?.failureRate === 100, JSON.stringify(providerSummary))
expect('model call provider summary keeps cost and duration', providerSummary[1]?.provider === 'Chapter Provider' && providerSummary[1]?.averageDurationMs === 1200 && Math.abs(providerSummary[1]?.estimatedCostUsd - 0.0005) < 0.000001, JSON.stringify(providerSummary))
expect('model call task summary orders by call count', taskSummary[0]?.task === 'provider-test' && taskSummary[0]?.failureRate === 100, JSON.stringify(taskSummary))
expect('model call task summary keeps primary provider and cost', taskSummary.some((task) => task.task === 'candidate-draft' && task.primaryProvider === 'Chapter Provider' && Math.abs(task.estimatedCostUsd - 0.0005) < 0.000001), JSON.stringify(taskSummary))

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

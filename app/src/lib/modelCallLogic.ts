export type ModelCallSummary = {
  callCount: number
  failedCount: number
  totalDurationMs: number
  averageDurationMs: number
  totalTokens: number
}

export type ModelCallEntry = {
  id: string
  task: string
  status: string
  provider: string
  chapter: string
  input: string
  output: string
  durationMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  message: string
  raw: string
}

export type ModelCallPricing = {
  id?: string
  name?: string
  model?: string
  inputPricePerMillionTokens?: number
  outputPricePerMillionTokens?: number
}

export type ModelCallCostSummary = {
  estimatedCostUsd: number
  pricedCallCount: number
  unpricedCallCount: number
}

export type ModelCallFailureGroup = {
  provider: string
  count: number
  tasks: string[]
  latestTask: string
  latestMessage: string
}

export type ModelCallFailureSummary = {
  totalFailed: number
  providerGroups: ModelCallFailureGroup[]
  recentFailures: ModelCallEntry[]
}

export type ModelCallProviderSummary = {
  provider: string
  callCount: number
  failedCount: number
  failureRate: number
  averageDurationMs: number
  totalTokens: number
  estimatedCostUsd: number
  pricedCallCount: number
  tasks: string[]
  latestStatus: string
  latestMessage: string
}

export function summarizeModelCallHistory(content: string): ModelCallSummary {
  const entries = parseModelCallHistory(content)

  let failedCount = 0
  let totalDurationMs = 0
  let durationSampleCount = 0
  let totalTokens = 0

  for (const entry of entries) {
    if (entry.status === 'failed') {
      failedCount += 1
    }
    if (entry.durationMs !== null && entry.durationMs > 0) {
      totalDurationMs += entry.durationMs
      durationSampleCount += 1
    }
    totalTokens += entry.totalTokens ?? 0
  }

  return {
    callCount: entries.length,
    failedCount,
    totalDurationMs,
    averageDurationMs: durationSampleCount === 0 ? 0 : Math.round(totalDurationMs / durationSampleCount),
    totalTokens,
  }
}

export function parseModelCallHistory(content: string): ModelCallEntry[] {
  return content
    .split(/\n##\s+/)
    .slice(1)
    .map((entry, index) => parseModelCallEntry(`## ${entry}`, index))
}

export function filterModelCallEntries(
  entries: ModelCallEntry[],
  filters: { status?: string; task?: string; query?: string },
) {
  const query = filters.query?.trim().toLowerCase() ?? ''
  return entries.filter((entry) => {
    if (filters.status && filters.status !== 'all' && entry.status !== filters.status) {
      return false
    }
    if (filters.task && filters.task !== 'all' && entry.task !== filters.task) {
      return false
    }
    if (query.length > 0) {
      const haystack = [
        entry.task,
        entry.status,
        entry.provider,
        entry.chapter,
        entry.input,
        entry.output,
        entry.message,
      ].join('\n').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

export function estimateModelCallCost(entry: ModelCallEntry, providers: ModelCallPricing[]) {
  const pricing = findModelCallPricing(entry, providers)
  if (!pricing) return null
  const inputPrice = positiveNumber(pricing.inputPricePerMillionTokens)
  const outputPrice = positiveNumber(pricing.outputPricePerMillionTokens)
  if (inputPrice === null && outputPrice === null) return null

  const promptCost = ((entry.promptTokens ?? 0) / 1_000_000) * (inputPrice ?? 0)
  const completionCost = ((entry.completionTokens ?? 0) / 1_000_000) * (outputPrice ?? 0)
  return promptCost + completionCost
}

export function summarizeModelCallCosts(entries: ModelCallEntry[], providers: ModelCallPricing[]): ModelCallCostSummary {
  let estimatedCostUsd = 0
  let pricedCallCount = 0
  let unpricedCallCount = 0

  for (const entry of entries) {
    const cost = estimateModelCallCost(entry, providers)
    if (cost === null) {
      unpricedCallCount += 1
    } else {
      estimatedCostUsd += cost
      pricedCallCount += 1
    }
  }

  return {
    estimatedCostUsd,
    pricedCallCount,
    unpricedCallCount,
  }
}

export function summarizeModelCallFailures(entries: ModelCallEntry[], recentLimit = 5): ModelCallFailureSummary {
  const failedEntries = entries.filter((entry) => entry.status === 'failed')
  const groups = new Map<string, ModelCallFailureGroup>()

  for (const entry of failedEntries) {
    const provider = entry.provider || '-'
    const group = groups.get(provider) ?? {
      provider,
      count: 0,
      tasks: [],
      latestTask: entry.task,
      latestMessage: entry.message,
    }
    group.count += 1
    if (!group.tasks.includes(entry.task)) {
      group.tasks.push(entry.task)
    }
    group.latestTask = entry.task
    group.latestMessage = entry.message
    groups.set(provider, group)
  }

  return {
    totalFailed: failedEntries.length,
    providerGroups: Array.from(groups.values()).sort((left, right) =>
      right.count - left.count || left.provider.localeCompare(right.provider),
    ),
    recentFailures: failedEntries.slice(-recentLimit).reverse(),
  }
}

export function summarizeModelCallProviders(
  entries: ModelCallEntry[],
  providers: ModelCallPricing[],
): ModelCallProviderSummary[] {
  const groups = new Map<string, {
    entries: ModelCallEntry[]
    durationTotal: number
    durationCount: number
    estimatedCostUsd: number
    pricedCallCount: number
    tasks: string[]
  }>()

  for (const entry of entries) {
    const provider = entry.provider || '-'
    const group = groups.get(provider) ?? {
      entries: [],
      durationTotal: 0,
      durationCount: 0,
      estimatedCostUsd: 0,
      pricedCallCount: 0,
      tasks: [],
    }
    group.entries.push(entry)
    if (entry.durationMs !== null && entry.durationMs > 0) {
      group.durationTotal += entry.durationMs
      group.durationCount += 1
    }
    const cost = estimateModelCallCost(entry, providers)
    if (cost !== null) {
      group.estimatedCostUsd += cost
      group.pricedCallCount += 1
    }
    if (!group.tasks.includes(entry.task)) {
      group.tasks.push(entry.task)
    }
    groups.set(provider, group)
  }

  return Array.from(groups.entries())
    .map(([provider, group]) => {
      const latest = group.entries[group.entries.length - 1]
      const failedCount = group.entries.filter((entry) => entry.status === 'failed').length
      return {
        provider,
        callCount: group.entries.length,
        failedCount,
        failureRate: group.entries.length === 0 ? 0 : Math.round((failedCount / group.entries.length) * 100),
        averageDurationMs: group.durationCount === 0 ? 0 : Math.round(group.durationTotal / group.durationCount),
        totalTokens: group.entries.reduce((total, entry) => total + (entry.totalTokens ?? 0), 0),
        estimatedCostUsd: group.estimatedCostUsd,
        pricedCallCount: group.pricedCallCount,
        tasks: group.tasks,
        latestStatus: latest?.status ?? 'unknown',
        latestMessage: latest?.message ?? '-',
      }
    })
    .sort((left, right) =>
      right.callCount - left.callCount ||
      right.failedCount - left.failedCount ||
      left.provider.localeCompare(right.provider),
    )
}

function parseModelCallEntry(entry: string, index: number): ModelCallEntry {
  const task = entry.match(/^##\s+(.+)$/m)?.[1]?.trim() ?? `call-${index + 1}`
  return {
    id: `${index}-${task}`,
    task,
    status: fieldValue(entry, 'status') || 'unknown',
    provider: fieldValue(entry, 'provider') || '-',
    chapter: fieldValue(entry, 'chapter') || '-',
    input: fieldValue(entry, 'input') || '-',
    output: fieldValue(entry, 'output') || '-',
    durationMs: optionalNumericField(entry, 'durationMs'),
    promptTokens: optionalNumericField(entry, 'promptTokens'),
    completionTokens: optionalNumericField(entry, 'completionTokens'),
    totalTokens: optionalNumericField(entry, 'totalTokens'),
    message: fieldValue(entry, 'message') || '-',
    raw: entry,
  }
}

function findModelCallPricing(entry: ModelCallEntry, providers: ModelCallPricing[]) {
  const providerLabel = normalizeProviderLabel(entry.provider)
  return providers.find((provider) => {
    const labels = [
      provider.name,
      provider.id,
      provider.model,
      provider.name && provider.model ? `${provider.name} (${provider.model})` : '',
      provider.id && provider.model ? `${provider.id} (${provider.model})` : '',
    ].map(normalizeProviderLabel)
    return labels.includes(providerLabel)
  })
}

function fieldValue(entry: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = entry.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, 'm'))
  return match?.[1]?.trim() ?? ''
}

function optionalNumericField(entry: string, field: string) {
  const value = Number(fieldValue(entry, field))
  return Number.isFinite(value) && value > 0 ? value : null
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function normalizeProviderLabel(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

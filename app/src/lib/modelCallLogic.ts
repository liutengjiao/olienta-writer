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

function fieldValue(entry: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = entry.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, 'm'))
  return match?.[1]?.trim() ?? ''
}

function optionalNumericField(entry: string, field: string) {
  const value = Number(fieldValue(entry, field))
  return Number.isFinite(value) && value > 0 ? value : null
}

export type ModelCallSummary = {
  callCount: number
  failedCount: number
  totalDurationMs: number
  averageDurationMs: number
  totalTokens: number
}

export function summarizeModelCallHistory(content: string): ModelCallSummary {
  const entries = content
    .split(/\n##\s+/)
    .slice(1)
    .map((entry) => `## ${entry}`)

  let failedCount = 0
  let totalDurationMs = 0
  let durationSampleCount = 0
  let totalTokens = 0

  for (const entry of entries) {
    if (fieldValue(entry, 'status') === 'failed') {
      failedCount += 1
    }
    const durationMs = numericField(entry, 'durationMs')
    if (durationMs > 0) {
      totalDurationMs += durationMs
      durationSampleCount += 1
    }
    totalTokens += numericField(entry, 'totalTokens')
  }

  return {
    callCount: entries.length,
    failedCount,
    totalDurationMs,
    averageDurationMs: durationSampleCount === 0 ? 0 : Math.round(totalDurationMs / durationSampleCount),
    totalTokens,
  }
}

function fieldValue(entry: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = entry.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, 'm'))
  return match?.[1]?.trim() ?? ''
}

function numericField(entry: string, field: string) {
  const value = Number(fieldValue(entry, field))
  return Number.isFinite(value) && value > 0 ? value : 0
}

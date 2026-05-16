function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildProviderExportJson(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!Array.isArray(parsed)) return content
    const sanitized = parsed.map((item) => {
      if (!isRecord(item)) return item
      const next = { ...item }
      delete next.apiKey
      delete next.apiKeyEncrypted
      return { ...next, apiKey: '' }
    })
    return `${JSON.stringify(sanitized, null, 2)}\n`
  } catch {
    return content
  }
}

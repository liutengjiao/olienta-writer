const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

export type BlueprintImportSection = {
  chapterId: string
  content: string
}

export function extractBlueprintImportSections(content: string, chapterCount: number): BlueprintImportSection[] {
  const normalized = content.replace(/\r\n?/g, '\n')
  const matches = Array.from(normalized.matchAll(/^#{1,4}\s*(?:第\s*)?([0-9]{1,4}|[零一二两三四五六七八九十百千]+)\s*[章节回][^\n]*$/gmu))
  if (matches.length === 0) return []

  return matches
    .map((match, index) => {
      const number = parseChapterNumber(match[1])
      const start = match.index ?? 0
      const end = matches[index + 1]?.index ?? normalized.length
      const section = normalized.slice(start, end).trim()
      if (!number || number > Math.max(chapterCount, number) || !section) return null
      return {
        chapterId: String(number).padStart(3, '0'),
        content: section,
      }
    })
    .filter((section): section is BlueprintImportSection => Boolean(section))
}

function parseChapterNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value)
  return chineseNumberToInteger(value)
}

function chineseNumberToInteger(value: string) {
  let total = 0
  let section = 0
  let current = 0

  for (const char of value) {
    const digit = CHINESE_DIGITS[char]
    if (digit !== undefined) {
      current = digit
      continue
    }
    if (char === '十') {
      section += (current || 1) * 10
      current = 0
      continue
    }
    if (char === '百') {
      section += (current || 1) * 100
      current = 0
      continue
    }
    if (char === '千') {
      section += (current || 1) * 1000
      current = 0
    }
  }

  total += section + current
  return total
}

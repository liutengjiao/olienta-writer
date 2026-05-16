export type InlineDiffChunk = {
  type: 'equal' | 'added' | 'removed'
  text: string
}

export type MarkdownAction =
  | 'h1'
  | 'h2'
  | 'bold'
  | 'quote'
  | 'list'
  | 'inline-code'
  | 'code-block'
  | 'hr'
  | 'clean'

type KeyboardLike = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const INLINE_DIFF_TOKEN_LIMIT = 900

export function markdownActionForKey(event: KeyboardLike): MarkdownAction | null {
  const command = event.ctrlKey || event.metaKey
  if (event.key === 'Tab') return 'list'
  if (!command) return null
  const key = event.key.toLowerCase()
  if (key === 'b') return 'bold'
  if (key === '`') return 'inline-code'
  if (event.shiftKey && key === 'x') return 'clean'
  if (event.altKey && key === '1') return 'h1'
  if (event.altKey && key === '2') return 'h2'
  if (event.altKey && key === 'q') return 'quote'
  if (event.shiftKey && key === '7') return 'list'
  if (key === '-') return 'hr'
  return null
}

export function applyMarkdownAction(value: string, selectionStart: number, selectionEnd: number, action: MarkdownAction) {
  if (action === 'clean') {
    const cleaned = cleanMarkdownWhitespace(value)
    return { value: cleaned, selectionStart: Math.min(selectionStart, cleaned.length), selectionEnd: Math.min(selectionEnd, cleaned.length) }
  }
  if (action === 'bold') return wrapSelection(value, selectionStart, selectionEnd, '**', '**', '加粗文本')
  if (action === 'inline-code') return wrapSelection(value, selectionStart, selectionEnd, '`', '`', 'code')
  if (action === 'code-block') return wrapSelection(value, selectionStart, selectionEnd, '```\n', '\n```', '代码')
  if (action === 'hr') return insertBlock(value, selectionStart, selectionEnd, '\n\n---\n\n')
  if (action === 'h1') return prefixSelectedLines(value, selectionStart, selectionEnd, '# ')
  if (action === 'h2') return prefixSelectedLines(value, selectionStart, selectionEnd, '## ')
  if (action === 'quote') return prefixSelectedLines(value, selectionStart, selectionEnd, '> ')
  return prefixSelectedLines(value, selectionStart, selectionEnd, '- ')
}

export function cleanPastedText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

export function replaceSelection(value: string, selectionStart: number, selectionEnd: number, replacement: string) {
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`
  const cursor = selectionStart + replacement.length
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor }
}

export function estimateTextUnits(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return 0
  const latinWords = trimmed.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0
  const cjkChars = trimmed.match(/[\u3400-\u9fff]/g)?.length ?? 0
  return latinWords + cjkChars
}

export function countParagraphs(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length
}

export function compareParagraphs(candidate: string, manuscript: string) {
  const candidateParagraphs = toComparableParagraphs(candidate)
  const manuscriptParagraphs = toComparableParagraphs(manuscript)
  const manuscriptSet = new Set(manuscriptParagraphs.map((item) => item.normalized))
  const candidateSet = new Set(candidateParagraphs.map((item) => item.normalized))

  return {
    candidateOnly: candidateParagraphs
      .filter((item) => !manuscriptSet.has(item.normalized))
      .map((item) => item.original),
    manuscriptOnly: manuscriptParagraphs
      .filter((item) => !candidateSet.has(item.normalized))
      .map((item) => item.original),
    sharedCount: candidateParagraphs.filter((item) => manuscriptSet.has(item.normalized)).length,
  }
}

export function compareInlineDiff(candidate: string, manuscript: string) {
  const candidateTokens = tokenizeInlineDiff(candidate).slice(0, INLINE_DIFF_TOKEN_LIMIT)
  const manuscriptTokens = tokenizeInlineDiff(manuscript).slice(0, INLINE_DIFF_TOKEN_LIMIT)
  const truncated =
    tokenizeInlineDiff(candidate).length > INLINE_DIFF_TOKEN_LIMIT ||
    tokenizeInlineDiff(manuscript).length > INLINE_DIFF_TOKEN_LIMIT
  const chunks = mergeInlineDiffChunks(diffTokens(manuscriptTokens, candidateTokens))
  return {
    chunks: trimInlineDiffChunks(chunks),
    addedUnits: chunks.filter((chunk) => chunk.type === 'added').reduce((sum, chunk) => sum + diffUnitCount(chunk.text), 0),
    removedUnits: chunks.filter((chunk) => chunk.type === 'removed').reduce((sum, chunk) => sum + diffUnitCount(chunk.text), 0),
    equalUnits: chunks.filter((chunk) => chunk.type === 'equal').reduce((sum, chunk) => sum + diffUnitCount(chunk.text), 0),
    truncated,
  }
}

function wrapSelection(value: string, selectionStart: number, selectionEnd: number, before: string, after: string, placeholder: string) {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder
  const replacement = `${before}${selected}${after}`
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`
  return {
    value: nextValue,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  }
}

function insertBlock(value: string, selectionStart: number, selectionEnd: number, block: string) {
  const nextValue = `${value.slice(0, selectionStart)}${block}${value.slice(selectionEnd)}`
  const cursor = selectionStart + block.length
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor }
}

function prefixSelectedLines(value: string, selectionStart: number, selectionEnd: number, prefix: string) {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const lineEndIndex = value.indexOf('\n', selectionEnd)
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
  const block = value.slice(lineStart, lineEnd)
  const nextBlock = block
    .split('\n')
    .map((line) => `${prefix}${line.replace(/^(#{1,6}\s+|>\s+|-\s+)/, '')}`)
    .join('\n')
  const nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`
  const added = nextBlock.length - block.length
  return {
    value: nextValue,
    selectionStart: selectionStart + prefix.length,
    selectionEnd: selectionEnd + added,
  }
}

function cleanMarkdownWhitespace(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

function tokenizeInlineDiff(content: string) {
  return content
    .replace(/[#>*_`-]+/g, ' ')
    .match(/[\u3400-\u9fff]|[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*|[^\s]/g) ?? []
}

function diffTokens(baseTokens: string[], nextTokens: string[]): InlineDiffChunk[] {
  const rows = baseTokens.length + 1
  const cols = nextTokens.length + 1
  const table = Array.from({ length: rows }, () => Array(cols).fill(0) as number[])

  for (let row = baseTokens.length - 1; row >= 0; row -= 1) {
    for (let col = nextTokens.length - 1; col >= 0; col -= 1) {
      table[row][col] = baseTokens[row] === nextTokens[col]
        ? table[row + 1][col + 1] + 1
        : Math.max(table[row + 1][col], table[row][col + 1])
    }
  }

  const chunks: InlineDiffChunk[] = []
  let row = 0
  let col = 0
  while (row < baseTokens.length && col < nextTokens.length) {
    if (baseTokens[row] === nextTokens[col]) {
      chunks.push({ type: 'equal', text: baseTokens[row] })
      row += 1
      col += 1
    } else if (table[row + 1][col] >= table[row][col + 1]) {
      chunks.push({ type: 'removed', text: baseTokens[row] })
      row += 1
    } else {
      chunks.push({ type: 'added', text: nextTokens[col] })
      col += 1
    }
  }
  while (row < baseTokens.length) {
    chunks.push({ type: 'removed', text: baseTokens[row] })
    row += 1
  }
  while (col < nextTokens.length) {
    chunks.push({ type: 'added', text: nextTokens[col] })
    col += 1
  }
  return chunks
}

function mergeInlineDiffChunks(chunks: InlineDiffChunk[]) {
  const merged: InlineDiffChunk[] = []
  for (const chunk of chunks) {
    const last = merged[merged.length - 1]
    if (last?.type === chunk.type) {
      last.text = joinDiffTokenText(last.text, chunk.text)
    } else {
      merged.push({ ...chunk })
    }
  }
  return merged
}

function trimInlineDiffChunks(chunks: InlineDiffChunk[]) {
  const importantIndexes = chunks
    .map((chunk, index) => chunk.type === 'equal' ? -1 : index)
    .filter((index) => index >= 0)
  if (importantIndexes.length === 0) return chunks.slice(0, 1)
  const start = Math.max(0, importantIndexes[0] - 2)
  const end = Math.min(chunks.length, importantIndexes[importantIndexes.length - 1] + 3)
  const output = chunks.slice(start, end)
  if (start > 0) output.unshift({ type: 'equal', text: '...' })
  if (end < chunks.length) output.push({ type: 'equal', text: '...' })
  return output
}

function joinDiffTokenText(left: string, right: string) {
  if (left === '...' || right === '...') return `${left}${right}`
  if (/^[\u3400-\u9fff]$/.test(right) || /^[,.;:!?，。；：！？、）】」]$/.test(right)) return `${left}${right}`
  if (/^[（【「]$/.test(right)) return `${left}${right}`
  return `${left} ${right}`
}

function diffUnitCount(text: string) {
  return tokenizeInlineDiff(text).length
}

function toComparableParagraphs(content: string) {
  const seen = new Set<string>()
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      original: paragraph,
      normalized: paragraph.replace(/\s+/g, ' ').trim(),
    }))
    .filter((paragraph) => {
      if (seen.has(paragraph.normalized)) return false
      seen.add(paragraph.normalized)
      return true
    })
}

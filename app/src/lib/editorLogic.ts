export type InlineDiffChunk = {
  type: 'equal' | 'added' | 'removed'
  text: string
}

export type SimilarParagraphDiff = {
  candidate: string
  manuscript: string
  similarity: number
  inlineDiff: ReturnType<typeof compareInlineDiff>
}

export type KnowledgeHitKind = 'fact' | 'loop' | 'rule'

export type KnowledgeHit = {
  kind: KnowledgeHitKind
  label: string
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

export function replaceTextRange(
  value: string,
  replacement: string,
  range: { start: number; end: number },
) {
  const start = Math.max(0, Math.min(range.start, value.length))
  const end = Math.max(start, Math.min(range.end, value.length))
  const normalizedReplacement = replacement.trim()
  const nextValue = `${value.slice(0, start)}${normalizedReplacement}${value.slice(end)}`
  return {
    value: nextValue,
    selectionStart: start,
    selectionEnd: start + normalizedReplacement.length,
  }
}

export function candidateTextForAdoption(candidate: string, selection: { start: number; end: number } | null) {
  const clamped = clampTextSelection(selection, candidate.length)
  const selected = clamped && clamped.start !== clamped.end ? candidate.slice(clamped.start, clamped.end) : ''
  return selected.trim() ? selected : candidate
}

export function adoptCandidateIntoManuscript(
  manuscript: string,
  candidate: string,
  mode: 'replace' | 'append' | 'insert',
  selection: { start: number; end: number } | null,
) {
  const normalizedCandidate = candidate.trim()
  if (mode === 'replace') {
    return {
      value: candidate,
      selectionStart: 0,
      selectionEnd: candidate.length,
    }
  }
  if (mode === 'append') {
    const prefix = manuscript.trim() ? `${manuscript.trimEnd()}\n\n` : ''
    const value = `${prefix}${candidate.trimStart()}`
    return {
      value,
      selectionStart: prefix.length,
      selectionEnd: value.length,
    }
  }

  const fallback = manuscript.length
  const start = Math.max(0, Math.min(selection?.start ?? fallback, manuscript.length))
  const end = Math.max(start, Math.min(selection?.end ?? fallback, manuscript.length))
  const before = manuscript.slice(0, start).replace(/[ \t]+$/g, '')
  const after = manuscript.slice(end).replace(/^[ \t]+/g, '')
  const prefix = before && !before.endsWith('\n') ? '\n\n' : ''
  const suffix = after && !after.startsWith('\n') ? '\n\n' : ''
  const insertedAt = before.length + prefix.length
  const value = `${before}${prefix}${normalizedCandidate}${suffix}${after}`
  return {
    value,
    selectionStart: insertedAt,
    selectionEnd: insertedAt + normalizedCandidate.length,
  }
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

export function compareSimilarParagraphs(candidate: string, manuscript: string, limit = 5): SimilarParagraphDiff[] {
  const paragraphDiff = compareParagraphs(candidate, manuscript)
  const unmatchedManuscript = [...paragraphDiff.manuscriptOnly]
  const pairs: SimilarParagraphDiff[] = []

  for (const candidateParagraph of paragraphDiff.candidateOnly) {
    let bestIndex = -1
    let bestScore = 0

    unmatchedManuscript.forEach((manuscriptParagraph, index) => {
      const score = paragraphSimilarity(candidateParagraph, manuscriptParagraph)
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    })

    if (bestIndex < 0 || bestScore < 0.35) continue
    const manuscriptParagraph = unmatchedManuscript.splice(bestIndex, 1)[0]
    pairs.push({
      candidate: candidateParagraph,
      manuscript: manuscriptParagraph,
      similarity: Math.round(bestScore * 100),
      inlineDiff: compareInlineDiff(candidateParagraph, manuscriptParagraph),
    })
  }

  return pairs
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
}

export function findKnowledgeHitsForParagraph(
  paragraph: string,
  sources: { confirmedFacts: string; openLoops: string; forbiddenRules: string },
  limitPerKind = 3,
): KnowledgeHit[] {
  const target = normalizeKnowledgeText(paragraph)
  if (!target) return []

  return [
    ...findKnowledgeHitsForKind(target, sources.confirmedFacts, 'fact', '事实', limitPerKind),
    ...findKnowledgeHitsForKind(target, sources.openLoops, 'loop', '伏笔', limitPerKind),
    ...findKnowledgeHitsForKind(target, sources.forbiddenRules, 'rule', '禁写', limitPerKind),
  ]
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

function clampTextSelection(selection: { start: number; end: number } | null, length: number) {
  if (!selection) return null
  const start = Math.max(0, Math.min(selection.start, length))
  const end = Math.max(start, Math.min(selection.end, length))
  return { start, end }
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

function findKnowledgeHitsForKind(
  target: string,
  source: string,
  kind: KnowledgeHitKind,
  label: string,
  limit: number,
) {
  const hits: KnowledgeHit[] = []
  const seen = new Set<string>()
  for (const entry of knowledgeEntries(source)) {
    const normalizedEntry = normalizeKnowledgeText(entry)
    if (!normalizedEntry || seen.has(normalizedEntry)) continue
    if (isKnowledgeEntryRelated(target, normalizedEntry)) {
      hits.push({ kind, label, text: trimKnowledgeHit(entry) })
      seen.add(normalizedEntry)
    }
    if (hits.length >= limit) break
  }
  return hits
}

function knowledgeEntries(source: string) {
  return source
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/^\s*(#{1,6}|[-*+]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length >= 4 && !/^#+\s*$/.test(line))
}

function isKnowledgeEntryRelated(target: string, entry: string) {
  if (target.includes(entry) || entry.includes(target)) return true
  const terms = knowledgeTerms(entry)
  if (terms.length === 0) return false
  const matched = terms.filter((term) => target.includes(term))
  const matchedUnits = matched.reduce((sum, term) => sum + term.length, 0)
  return matched.length >= Math.min(2, terms.length) && matchedUnits >= 4
}

function knowledgeTerms(value: string) {
  const terms: string[] = []
  for (const match of value.matchAll(/[\u3400-\u9fff]{2,}|[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)) {
    const token = match[0].toLowerCase()
    if (/^[\u3400-\u9fff]+$/.test(token)) {
      for (let index = 0; index < token.length - 1; index += 1) {
        terms.push(token.slice(index, index + 2))
      }
    } else if (token.length >= 2) {
      terms.push(token)
    }
  }
  return Array.from(new Set(terms))
}

function normalizeKnowledgeText(value: string) {
  return value.replace(/[#>*_`~[\](){}:：，。、“”‘’；;,.!?！？-]+/g, ' ').replace(/\s+/g, '').toLowerCase()
}

function trimKnowledgeHit(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= 96) return compact
  return `${compact.slice(0, 96)}...`
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

function paragraphSimilarity(left: string, right: string) {
  const leftTokens = tokenizeInlineDiff(left)
  const rightTokens = tokenizeInlineDiff(right)
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0
  return lcsLength(leftTokens, rightTokens) / Math.max(leftTokens.length, rightTokens.length)
}

function lcsLength(left: string[], right: string[]) {
  const rows = left.length + 1
  const cols = right.length + 1
  const table = Array.from({ length: rows }, () => Array(cols).fill(0) as number[])

  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let col = right.length - 1; col >= 0; col -= 1) {
      table[row][col] = left[row] === right[col]
        ? table[row + 1][col + 1] + 1
        : Math.max(table[row + 1][col], table[row][col + 1])
    }
  }

  return table[0][0]
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

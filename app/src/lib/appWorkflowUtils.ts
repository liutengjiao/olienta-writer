import type { CandidateReviewIssue } from '../types'

export function warningsFromIssues(issues: CandidateReviewIssue[]) {
  return issues.map((issue) => issue.description)
}

export function issueFromWarning(description: string): CandidateReviewIssue {
  const lowerDescription = description.toLowerCase()
  const isHighRisk =
    lowerDescription.includes('forbidden') ||
    description.includes('\u7981\u5199') ||
    description.includes('\u65f6\u95f4\u7ebf')
  return {
    severity: isHighRisk ? 'high' : 'medium',
    category: description.includes('\u65f6\u95f4\u7ebf') ? 'timeline' : description.includes('\u4e8b\u5b9e') ? 'fact' : 'other',
    location: 'Candidate draft',
    description,
    evidence: description,
    fix_hint: 'Review the warning, revise the candidate draft, then save again.',
    blocking: isHighRisk,
  }
}

export function issuesFromWarnings(warnings: string[]) {
  return warnings.map(issueFromWarning)
}

export function clampSelection(selection: { start: number; end: number } | null, length: number) {
  if (!selection) return null
  const start = Math.max(0, Math.min(selection.start, length))
  const end = Math.max(start, Math.min(selection.end, length))
  return { start, end }
}

export function trimPreview(value: string, limit = 80) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= limit) return compact
  return `${compact.slice(0, limit)}...`
}

export function knowledgeSourceKind(kind: 'fact' | 'loop' | 'rule') {
  if (kind === 'fact') return 'confirmed-facts'
  if (kind === 'loop') return 'open-loops'
  return 'forbidden-rules'
}

export function findTextRange(source: string, content: string) {
  const trimmed = content.trim()
  if (!trimmed) return null
  const directIndex = source.indexOf(trimmed)
  if (directIndex >= 0) {
    return { start: directIndex, end: directIndex + trimmed.length }
  }

  const normalizedTarget = normalizeParagraphText(trimmed)
  const paragraphs = source.split(/\n\s*\n/)
  let offset = 0
  for (const paragraph of paragraphs) {
    const startOffset = source.indexOf(paragraph, offset)
    const paragraphStart = startOffset >= 0 ? startOffset : offset
    if (normalizeParagraphText(paragraph) === normalizedTarget) {
      const leading = paragraph.length - paragraph.trimStart().length
      const trimmedLength = paragraph.trim().length
      return {
        start: paragraphStart + leading,
        end: paragraphStart + leading + trimmedLength,
      }
    }
    offset = paragraphStart + paragraph.length
  }
  return null
}

export function normalizeParagraphText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

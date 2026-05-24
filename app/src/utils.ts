import { defaultChapters, defaultProjectForm, wutongboliSampleProject } from './constants'
import type { CreateProjectInput, ProjectSummary } from './types'

export function previewProjectFromForm(form: CreateProjectInput): ProjectSummary {
  return {
    name: form.name || '预览项目',
    root_path: form.root_path || '浏览器预览模式',
    language: form.language,
    chapter_count: form.chapter_count,
  }
}

export function countWords(content: string) {
  return Array.from(content).filter((value) => !/\s/.test(value)).length
}

export function errorToString(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function makePreviewChapters(count: number) {
  return Array.from({ length: Math.max(count, 1) }, (_, index) => {
    const existing = defaultChapters[index]
    const id = `${index + 1}`.padStart(3, '0')
    return existing ?? { id, title: `第${index + 1}章 未命名`, words: 0, state: '待规划' }
  })
}

export function isSampleProjectRoot(rootPath: string) {
  return normalizeProjectPath(rootPath) === normalizeProjectPath(wutongboliSampleProject.root_path)
}

export function ensureTrailingBackslash(value: string) {
  const trimmed = stripWindowsVerbatimPrefix(value.trim())
  if (!trimmed) return ''
  return trimmed.endsWith('\\') || trimmed.endsWith('/') ? trimmed : `${trimmed}\\`
}

export function normalizeSaveLocation(value: string) {
  const trimmed = stripWindowsVerbatimPrefix(value.trim())
  if (!trimmed) return ''
  const normalized = trimmed.replace(/[\\/]+$/, '')
  if (!defaultProjectForm.root_path.trim()) return trimmed
  const defaultRoot = defaultProjectForm.root_path.replace(/[\\/]+$/, '')
  const normalizedLower = normalized.replaceAll('\\', '/').toLowerCase()
  const defaultLower = defaultRoot.replaceAll('\\', '/').toLowerCase()

  if (normalizedLower.startsWith(`${defaultLower}/`)) {
    const relative = normalized.slice(defaultRoot.length).replace(/^[\\/]+/, '')
    if (relative && !relative.includes('\\') && !relative.includes('/')) {
      return defaultProjectForm.root_path
    }
  }
  return trimmed
}

export function stripWindowsVerbatimPrefix(value: string) {
  return value.replace(/^\\\\\?\\/, '')
}

export function normalizePathKey(value: string) {
  return stripWindowsVerbatimPrefix(value.trim()).replace(/[\\/]+$/, '').replaceAll('\\', '/').toLowerCase()
}

export function sanitizeProjectFolderName(value: string) {
  return value
    .trim()
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? '-' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
}

function normalizeProjectPath(value: string) {
  return normalizePathKey(value)
}

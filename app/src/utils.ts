import { defaultChapters } from './constants'
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

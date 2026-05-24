import type { ChapterSummary, CreateProjectInput, TaskItem } from './types'

export const defaultChapters: ChapterSummary[] = [
  { id: '001', title: '第一章 未命名', words: 0, state: '草稿' },
  { id: '002', title: '第二章 未命名', words: 0, state: '待规划' },
  { id: '003', title: '第三章 未命名', words: 0, state: '待规划' },
]

export const defaultProjectForm: CreateProjectInput = {
  name: '',
  root_path: '',
  language: 'zh-CN',
  chapter_count: 3,
  target_words_per_chapter: 3000,
  template: 'blank',
}

export const wutongboliSampleProject = {
  name: '无痛剥离',
  root_path: 'sample://wutongboli',
  language: 'zh-CN',
  chapter_count: 3,
  target_words_per_chapter: 10000,
  template: 'literary',
}

export const templates = [
  { value: 'blank', label: '空白项目' },
  { value: 'literary', label: '严肃文学长篇' },
  { value: 'webnovel', label: '网文长篇' },
  { value: 'literary-realism-classical-chapter', label: '现实主义章回体' },
  { value: 'literary-scifi', label: '文学科幻' },
]

export const defaultTasks: TaskItem[] = [
  { id: 'shell', label: '应用骨架已创建', status: 'done' },
  { id: 'project', label: '本地项目模型已接入', status: 'ready' },
  { id: 'ai', label: 'AI 候选稿接口已接入', status: 'ready' },
]

export const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

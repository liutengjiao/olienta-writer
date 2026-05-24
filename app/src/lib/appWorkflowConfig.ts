import type { ModuleKey, ModuleSubViewKey, ViewKey } from '../types'

export const frameworkFileByView: Partial<Record<ViewKey, string>> = {
  'novel-settings': '01-setting.md',
  'story-premise': '02-premise.md',
  characters: '03-characters.md',
  'plot-outline': '04-plot-outline.md',
  world: '05-world.md',
  'important-scenes': '07-scenes.md',
}

export const defaultMarkdownByModuleView: Partial<Record<ModuleSubViewKey, string>> = {
  'knowledge-overview': 'knowledge/README.md',
  'knowledge-facts': 'facts/confirmed-facts.md',
  'knowledge-markdown': 'knowledge/markdown/README.md',
  'knowledge-search': 'knowledge/search/README.md',
  'characters-overview': 'framework/03-characters.md',
  'characters-cards': 'characters/cards/README.md',
  'characters-relations': 'characters/relations.md',
  'characters-growth': 'characters/growth.md',
  'tasks-current': 'tasks/current.json',
  'tasks-history': 'tasks/history.jsonl',
  'logs-author-confirmation': 'facts/author-confirmation.md',
  'logs-confirmations': 'logs/confirmations/001.md',
  'logs-system-events': 'logs/system-events.jsonl',
  'model-providers': 'models/README.md',
  'model-call-records': 'logs/model-calls/history.md',
  'model-tests': 'logs/model-calls/history.md',
}

export const AI_GENERATION_SOFT_TIMEOUT_SECONDS = 60

export const previewByFrameworkFile: Record<string, string> = {
  '01-setting.md': '# Novel Structure\n\nProject summary and global writing settings appear here.\n',
  '02-premise.md': '# Story Premise\n\n## One-line Premise\n\n## Expanded Premise\n\n## Core Question\n\n',
  '03-characters.md': '# Characters\n\n## Main Characters\n\n## Relationships\n\n## Growth\n\n',
  '04-plot-outline.md': '# Plot Outline\n\n## Structure\n\n## Volumes\n\n## Turning Points\n\n',
  '05-world.md': '# Worldbuilding\n\n## Era\n\n## Places\n\n## Rules\n\n',
  '07-scenes.md': '# Important Scenes\n\n## Scene List\n\n## Required Scenes\n\n## Forbidden Early Scenes\n\n',
}

export function defaultModuleView(module: ModuleKey): ModuleSubViewKey {
  if (module === 'knowledge') return 'knowledge-markdown'
  if (module === 'characters') return 'characters-overview'
  if (module === 'tasks') return 'tasks-current'
  if (module === 'logs') return 'logs-author-confirmation'
  if (module === 'model-calls') return 'model-providers'
  if (module === 'project-structure') return 'home-entry'
  return 'home-recent'
}

export type RecentParagraphReplacement = {
  chapterId: string
  previousManuscript: string
  replacedManuscript: string
  originalRange: { start: number; end: number }
  replacementSelection: { start: number; end: number }
  candidatePreview: string
  manuscriptPreview: string
}

export type KnowledgeRestoreSelection = {
  kind: 'confirmed-facts' | 'open-loops' | 'forbidden-rules'
  start: number
  end: number
}

export type CandidateRestoreSource = {
  historyPath: string
  confirmationPath: string
  confirmationEntryId: string
}

import { useState } from 'react'
import type { ModuleKey, ModuleSubViewKey, ProjectSummary } from '../types'

type UseRecordNavigationInput = {
  project: ProjectSummary | null
  loadMarkdownFile: (rootPath: string, relativePath: string) => Promise<void>
  setActiveModule: (module: ModuleKey) => void
  setActiveModuleView: (view: ModuleSubViewKey) => void
  setMessage: (message: string) => void
}

export function useRecordNavigation({
  project,
  loadMarkdownFile,
  setActiveModule,
  setActiveModuleView,
  setMessage,
}: UseRecordNavigationInput) {
  const [highlightedModelCallId, setHighlightedModelCallId] = useState('')
  const [highlightedConfirmationPath, setHighlightedConfirmationPath] = useState('')
  const [highlightedConfirmationEntryId, setHighlightedConfirmationEntryId] = useState('')

  function openModelCallRecord(logEntryId: string) {
    if (!logEntryId.trim()) {
      setMessage('Done.')
      return
    }

    setHighlightedModelCallId(logEntryId)
    setActiveModule('model-calls')
    setActiveModuleView('model-call-records')
    if (project) {
      void loadMarkdownFile(project.root_path, 'logs/model-calls/history.md')
    }
  }

  function clearModelCallHighlight() {
    setHighlightedModelCallId('')
  }

  function openConfirmationRecord(confirmationPath: string, confirmationEntryId = '') {
    if (!confirmationPath.trim()) {
      setMessage('Done.')
      return
    }

    setHighlightedConfirmationPath(confirmationPath)
    setHighlightedConfirmationEntryId(confirmationEntryId)
    setActiveModule('logs')
    setActiveModuleView('logs-confirmations')
    if (project) {
      void loadMarkdownFile(project.root_path, confirmationPath)
    }
  }

  function clearConfirmationHighlight() {
    setHighlightedConfirmationPath('')
    setHighlightedConfirmationEntryId('')
  }

  return {
    highlightedModelCallId,
    highlightedConfirmationPath,
    highlightedConfirmationEntryId,
    openModelCallRecord,
    clearModelCallHighlight,
    openConfirmationRecord,
    clearConfirmationHighlight,
  }
}

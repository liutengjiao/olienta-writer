import { useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
import type { BlueprintHistorySummary, ProjectSummary } from '../types'
import { errorToString, isSampleProjectRoot } from '../utils'

type UseBlueprintHistoryWorkflowInput = {
  project: ProjectSummary | null
  setMessage: (message: string) => void
}

export function useBlueprintHistoryWorkflow({
  project,
  setMessage,
}: UseBlueprintHistoryWorkflowInput) {
  const [blueprintHistory, setBlueprintHistory] = useState<BlueprintHistorySummary[]>([])
  const [selectedBlueprintHistoryPath, setSelectedBlueprintHistoryPath] = useState('')
  const [blueprintHistoryPreview, setBlueprintHistoryPreview] = useState('')

  async function refresh(rootPath: string, chapterId: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setBlueprintHistory([])
      setSelectedBlueprintHistoryPath('')
      setBlueprintHistoryPreview('?')
      return
    }

    const history = await tauriApi.listBlueprintHistory(rootPath, chapterId)
    setBlueprintHistory(history)
    setSelectedBlueprintHistoryPath(history[0]?.relative_path ?? '')
    setBlueprintHistoryPreview(history.length === 0 ? 'No blueprint history yet.' : '')
  }

  async function loadPreview(relativePath: string) {
    if (!project) {
      return
    }
    if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
      setSelectedBlueprintHistoryPath(relativePath)
      setBlueprintHistoryPreview('/?')
      return
    }

    setSelectedBlueprintHistoryPath(relativePath)
    try {
      const history = await tauriApi.loadBlueprintHistory(project.root_path, relativePath)
      setBlueprintHistoryPreview(history.content)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  return {
    blueprintHistory,
    selectedBlueprintHistoryPath,
    blueprintHistoryPreview,
    refresh,
    loadPreview,
  }
}

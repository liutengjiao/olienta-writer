import { useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { issuesFromWarnings, warningsFromIssues } from '../lib/appWorkflowUtils'
import type { CandidateRestoreSource } from '../lib/appWorkflowConfig'
import type { BlueprintHistorySummary, CandidateReviewIssue, ModuleKey, ProjectSummary, ViewKey } from '../types'
import { countWords, errorToString, isSampleProjectRoot } from '../utils'
import { isTauriRuntime } from '../constants'

type CandidateHistoryJumpSource = {
  historyPath: string
  confirmationPath: string
  confirmationEntryId: string
}

type UseCandidateHistoryWorkflowInput = {
  project: ProjectSummary | null
  selectedChapterId: string
  candidatePath: string
  selectChapterAndRefresh: (chapterId: string) => Promise<void>
  loadMarkdownFile: (rootPath: string, relativePath: string) => Promise<void>
  setActiveModule: (module: ModuleKey) => void
  setActiveView: (view: ViewKey) => void
  setCandidate: (content: string) => void
  setCandidateSelection: (selection: { start: number; end: number } | null) => void
  setCandidateRestoreSource: (source: CandidateRestoreSource | null) => void
  setCandidateReviewIssues: (issues: CandidateReviewIssue[]) => void
  setCandidateWarnings: (warnings: string[]) => void
  setMessage: (message: string) => void
}

export function useCandidateHistoryWorkflow({
  project,
  selectedChapterId,
  candidatePath,
  selectChapterAndRefresh,
  loadMarkdownFile,
  setActiveModule,
  setActiveView,
  setCandidate,
  setCandidateSelection,
  setCandidateRestoreSource,
  setCandidateReviewIssues,
  setCandidateWarnings,
  setMessage,
}: UseCandidateHistoryWorkflowInput) {
  const [candidateHistory, setCandidateHistory] = useState<BlueprintHistorySummary[]>([])
  const [selectedCandidateHistoryPath, setSelectedCandidateHistoryPath] = useState('')
  const [candidateHistoryPreview, setCandidateHistoryPreview] = useState('')
  const [candidateHistoryJumpSource, setCandidateHistoryJumpSource] = useState<CandidateHistoryJumpSource | null>(null)

  async function refresh(rootPath: string, chapterId: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setCandidateHistory([])
      setSelectedCandidateHistoryPath('')
      setCandidateHistoryPreview('?')
      return
    }

    const history = await tauriApi.listCandidateHistory(rootPath, chapterId)
    setCandidateHistory(history)
    setSelectedCandidateHistoryPath(history[0]?.relative_path ?? '')
    setCandidateHistoryPreview(history.length === 0 ? 'No candidate history yet.' : '')
  }

  async function loadPreview(relativePath: string, keepJumpSource = false) {
    if (!project) {
      return
    }
    if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
      if (!keepJumpSource) {
        setCandidateHistoryJumpSource(null)
      }
      setSelectedCandidateHistoryPath(relativePath)
      setCandidateHistoryPreview('/?')
      return
    }

    if (!keepJumpSource) {
      setCandidateHistoryJumpSource(null)
    }
    setSelectedCandidateHistoryPath(relativePath)
    try {
      const history = await tauriApi.loadCandidateHistory(project.root_path, relativePath)
      setCandidateHistoryPreview(history.content)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function openVersion(manifestPath: string, confirmationPath = '', confirmationEntryId = '') {
    if (!manifestPath.trim()) {
      setMessage('Done.')
      return
    }

    const normalized = manifestPath.replaceAll('\\', '/')
    const match = /^manuscript\/candidates\/history\/([^/]+)\/(.+)\.json$/.exec(normalized)
    if (!match) {
      setMessage('Done.')
      return
    }

    const chapterId = match[1]
    const historyPath = `manuscript/candidates/history/${chapterId}/${match[2]}.md`
    setActiveModule('project-structure')
    setActiveView('draft-box')
    if (chapterId !== selectedChapterId) {
      await selectChapterAndRefresh(chapterId)
    }
    setCandidateHistoryJumpSource({
      historyPath,
      confirmationPath,
      confirmationEntryId,
    })
    await loadPreview(historyPath, true)
  }

  async function restore() {
    if (!selectedCandidateHistoryPath || !candidateHistoryPreview.trim()) {
      setMessage('Done.')
      return
    }

    const selectedHistory = candidateHistory.find((item) => item.relative_path === selectedCandidateHistoryPath)
    const restoreSource = {
      historyPath: selectedCandidateHistoryPath,
      confirmationPath: candidateHistoryJumpSource?.confirmationPath || selectedHistory?.confirmation_path || '',
      confirmationEntryId: candidateHistoryJumpSource?.confirmationEntryId || selectedHistory?.confirmation_entry_id || '',
    }
    setCandidate(candidateHistoryPreview)
    setCandidateSelection(null)
    setCandidateRestoreSource(restoreSource)
    const issues = isTauriRuntime && project && !isSampleProjectRoot(project.root_path)
      ? await tauriApi.reviewCandidateDraftForChapter(project.root_path, selectedChapterId, candidateHistoryPreview)
      : countWords(candidateHistoryPreview) < 500
        ? issuesFromWarnings(['Candidate draft is too short.'])
        : []
    setCandidateReviewIssues(issues)
    setCandidateWarnings(warningsFromIssues(issues))
    if (project && isTauriRuntime && !isSampleProjectRoot(project.root_path)) {
      await tauriApi.recordCandidateHistoryRestore(
        project.root_path,
        selectedChapterId,
        selectedCandidateHistoryPath,
        candidatePath,
        restoreSource.confirmationPath,
        restoreSource.confirmationEntryId,
      )
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
    }
    setMessage('Done.')
  }

  return {
    candidateHistory,
    selectedCandidateHistoryPath,
    candidateHistoryPreview,
    candidateHistoryJumpSource,
    refresh,
    loadPreview,
    openVersion,
    restore,
  }
}

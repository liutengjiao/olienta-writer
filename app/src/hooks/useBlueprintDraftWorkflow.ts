import type { Dispatch, SetStateAction } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
import type { ProjectSummary } from '../types'
import { errorToString, isSampleProjectRoot } from '../utils'

type TaskStatus = 'ready' | 'working' | 'done' | 'error'

type UseBlueprintDraftWorkflowInput = {
  project: ProjectSummary | null
  selectedChapterId: string
  authorInput: string
  blueprint: string
  manuscript: string
  refreshBlueprintHistory: (rootPath: string, chapterId: string) => Promise<void>
  pushTaskLog: (message: string, status: TaskStatus) => void
  setAssistantState: (state: string) => void
  setBlueprint: Dispatch<SetStateAction<string>>
  setBlueprintPath: (path: string) => void
  setMessage: (message: string) => void
}

const PREVIEW_BLUEPRINT_APPEND = '\n\n## AI Draft\n\nReview before saving.'

export function useBlueprintDraftWorkflow({
  project,
  selectedChapterId,
  authorInput,
  blueprint,
  manuscript,
  refreshBlueprintHistory,
  pushTaskLog,
  setAssistantState,
  setBlueprint,
  setBlueprintPath,
  setMessage,
}: UseBlueprintDraftWorkflowInput) {
  async function regenerateFollowingBlueprints() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('Working')
        setMessage('Done.')
        return
      }

      const saved = await tauriApi.regenerateFollowingBlueprints(project.root_path, selectedChapterId)
      setBlueprintPath(saved.relative_path)
      await refreshBlueprintHistory(project.root_path, selectedChapterId)
      setAssistantState('Working')
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
    }
  }

  async function regenerateAllBlueprints() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    pushTaskLog('Regenerating all blueprints.', 'working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('Working')
        setMessage('Done.')
        pushTaskLog('Preview: regenerated all blueprints.', 'done')
        return
      }

      const saved = await tauriApi.regenerateAllBlueprints(project.root_path)
      setBlueprintPath(saved.relative_path)
      setBlueprint(saved.content)
      await refreshBlueprintHistory(project.root_path, selectedChapterId)
      setAssistantState('Working')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  async function generateBlueprintDraft() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    pushTaskLog('Task status updated.', 'working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setBlueprint((content) => `${content.trim()}${PREVIEW_BLUEPRINT_APPEND}`)
        setAssistantState('Working')
        pushTaskLog('Preview: generated blueprint draft.', 'done')
        return
      }

      const draft = await tauriApi.generateBlueprintDraft(
        project.root_path,
        selectedChapterId,
        `${blueprint}\n\n## Current Author Input\n\n${authorInput}`,
      )
      setBlueprintPath(draft.relative_path)
      setBlueprint(draft.content)
      await refreshBlueprintHistory(project.root_path, selectedChapterId)
      setAssistantState('Working')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  async function generateBlueprintFromManuscript() {
    if (!project) {
      setMessage('Done.')
      return
    }

    const source = manuscript.trim()
    if (!source) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    pushTaskLog('Task status updated.', 'working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setBlueprint((content) => `${content.trim()}${PREVIEW_BLUEPRINT_APPEND}`)
        setAssistantState('Working')
        pushTaskLog('Preview: generated reverse blueprint.', 'done')
        return
      }

      const draft = await tauriApi.generateBlueprintDraft(
        project.root_path,
        selectedChapterId,
        [
          '## Current Material',
          'Generate content from the current material.',
          '',
          '## Current Material',
          source,
        ].join('\n'),
      )
      setBlueprintPath(draft.relative_path)
      setBlueprint(draft.content)
      await refreshBlueprintHistory(project.root_path, selectedChapterId)
      setAssistantState('Working')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  return {
    regenerateFollowingBlueprints,
    regenerateAllBlueprints,
    generateBlueprintDraft,
    generateBlueprintFromManuscript,
  }
}

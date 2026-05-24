import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
import type { ModuleKey, ModuleSubViewKey, ProjectSearchResult, ProjectSummary } from '../types'
import { errorToString, isSampleProjectRoot } from '../utils'

type UseWritingBriefWorkflowInput = {
  project: ProjectSummary | null
  selectedChapterId: string
  loadMarkdownFile: (rootPath: string, relativePath: string) => Promise<void>
  loadMarkdownFiles: (rootPath: string) => Promise<void>
  pushTaskLog: (message: string, status: 'ready' | 'working' | 'done' | 'error') => void
  setActiveModule: (module: ModuleKey) => void
  setActiveModuleView: (view: ModuleSubViewKey) => void
  setAssistantState: (state: string) => void
  setMessage: (message: string) => void
  setWritingBrief: Dispatch<SetStateAction<string>>
  setWritingBriefPath: (path: string) => void
}

const PREVIEW_BRIEF = '## Chapter Writing Brief\n\nGenerate the chapter writing brief from the current blueprint, manuscript, and facts.'

export function useWritingBriefWorkflow({
  project,
  selectedChapterId,
  loadMarkdownFile,
  loadMarkdownFiles,
  pushTaskLog,
  setActiveModule,
  setActiveModuleView,
  setAssistantState,
  setMessage,
  setWritingBrief,
  setWritingBriefPath,
}: UseWritingBriefWorkflowInput) {
  async function composeBrief() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    pushTaskLog('Task status updated.', 'working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setWritingBriefPath(`tasks/writing-briefs/${selectedChapterId}.md`)
        setWritingBrief(PREVIEW_BRIEF)
        setAssistantState('Working')
        pushTaskLog('Preview: generated writing brief.', 'done')
        return
      }

      const brief = await tauriApi.composeWritingBrief(project.root_path, selectedChapterId)
      setWritingBrief(brief.content)
      setWritingBriefPath(brief.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setAssistantState('Working')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  async function pinSearchResultToBrief(result: ProjectSearchResult) {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setWritingBrief(PREVIEW_BRIEF)
        setAssistantState('Working')
        return
      }

      const brief = await tauriApi.pinSearchResultToWritingBrief(
        project.root_path,
        selectedChapterId,
        result.relative_path,
        result.line_number,
        result.snippet,
      )
      setWritingBrief(brief.content)
      setWritingBriefPath(brief.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, brief.relative_path)
      setActiveModule('tasks')
      setActiveModuleView('tasks-current')
      setAssistantState('Working')
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
    }
  }

  async function pinSearchResultsToBrief(results: ProjectSearchResult[]) {
    if (!project) {
      setMessage('Done.')
      return
    }
    if (results.length === 0) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setWritingBrief((content) => {
          const items = results
            .map((result) => `- ${result.relative_path}:${result.line_number}\n  ${result.snippet}`)
            .join('\n')
          return `${content.trim()}\n\n## \n\n${items}\n`
        })
        setAssistantState('Working')
        return
      }

      const brief = await tauriApi.pinSearchResultsToWritingBrief(
        project.root_path,
        selectedChapterId,
        results.map((result) => ({
          source_path: result.relative_path,
          line_number: result.line_number,
          snippet: result.snippet,
        })),
      )
      setWritingBrief(brief.content)
      setWritingBriefPath(brief.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, brief.relative_path)
      setActiveModule('tasks')
      setActiveModuleView('tasks-current')
      setAssistantState('Working')
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
    }
  }

  const listPinnedContextForCurrentChapter = useCallback(async () => {
    if (!project || !isTauriRuntime || isSampleProjectRoot(project.root_path)) {
      return []
    }

    return tauriApi.listPinnedContext(project.root_path, selectedChapterId)
  }, [project, selectedChapterId])

  async function removePinnedContextItem(index: number) {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setMessage('Done.')
        return
      }

      const brief = await tauriApi.removePinnedContextItem(project.root_path, selectedChapterId, index)
      setWritingBrief(brief.content)
      setWritingBriefPath(brief.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, brief.relative_path)
      setAssistantState('Working')
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
    }
  }

  return {
    composeBrief,
    pinSearchResultToBrief,
    pinSearchResultsToBrief,
    listPinnedContextForCurrentChapter,
    removePinnedContextItem,
  }
}

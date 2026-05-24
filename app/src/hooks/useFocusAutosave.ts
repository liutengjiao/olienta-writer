import { useEffect, useRef } from 'react'
import type { ProjectSummary, ViewKey } from '../types'

type UseFocusAutosaveInput = {
  focusMode: boolean
  setFocusMode: (updater: (current: boolean) => boolean) => void
  manuscript: string
  project: ProjectSummary | null
  saveChapterContent: (content: string) => Promise<boolean | undefined>
  setActiveView: (view: ViewKey) => void
}

export function useFocusAutosave({
  focusMode,
  setFocusMode,
  manuscript,
  project,
  saveChapterContent,
  setActiveView,
}: UseFocusAutosaveInput) {
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveLastValueRef = useRef('')
  const saveChapterContentRef = useRef(saveChapterContent)

  useEffect(() => {
    saveChapterContentRef.current = saveChapterContent
  }, [saveChapterContent])

  function clearAutosaveTimers() {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (autosaveRetryTimerRef.current) {
      clearTimeout(autosaveRetryTimerRef.current)
      autosaveRetryTimerRef.current = null
    }
  }

  useEffect(() => {
    clearAutosaveTimers()

    if (!focusMode || !project || manuscript === autosaveLastValueRef.current) {
      return
    }

    autosaveTimerRef.current = setTimeout(() => {
      const content = manuscript
      void saveChapterContentRef.current(content).then((ok) => {
        if (ok) {
          autosaveLastValueRef.current = content
          return
        }

        autosaveRetryTimerRef.current = setTimeout(() => {
          void saveChapterContentRef.current(content).then((retryOk) => {
            if (retryOk) autosaveLastValueRef.current = content
          })
        }, 5000)
      })
    }, 1200)

    return clearAutosaveTimers
  }, [focusMode, manuscript, project])

  function toggleFocusMode() {
    setFocusMode((current) => {
      const next = !current
      if (next) {
        autosaveLastValueRef.current = manuscript
      } else if (project && manuscript !== autosaveLastValueRef.current) {
        void saveChapterContentRef.current(manuscript).then((ok) => {
          if (ok) autosaveLastValueRef.current = manuscript
        })
      }
      return next
    })
    setActiveView('manuscript')
  }

  return { toggleFocusMode }
}

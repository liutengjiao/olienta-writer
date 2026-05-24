import { useEffect, useRef, useState } from 'react'
import { AI_GENERATION_SOFT_TIMEOUT_SECONDS } from '../lib/appWorkflowConfig'
import type { TaskStatus } from '../types'

type UseCandidateGenerationTrackerInput = {
  selectedChapterId: string
  pushTaskLog: (message: string, status?: TaskStatus) => void
}

export function useCandidateGenerationTracker({
  selectedChapterId,
  pushTaskLog,
}: UseCandidateGenerationTrackerInput) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('Not started')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const runRef = useRef(0)
  const requestRef = useRef('')
  const logSecondRef = useRef(0)

  useEffect(() => {
    if (!running || !startedAt) return
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
      const slowHint = elapsedSeconds >= AI_GENERATION_SOFT_TIMEOUT_SECONDS
        ? ' - still waiting'
        : ''
      setStatus(`Working ${elapsedSeconds}s${slowHint}`)
      if (elapsedSeconds === 1 || elapsedSeconds - logSecondRef.current >= 10) {
        logSecondRef.current = elapsedSeconds
        pushTaskLog('Task status updated.', 'working')
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, startedAt, pushTaskLog, selectedChapterId])

  function begin(requestId: string) {
    const runId = runRef.current + 1
    runRef.current = runId
    requestRef.current = requestId
    logSecondRef.current = 0
    setRunning(true)
    setStartedAt(Date.now())
    setStatus('Working')
    return runId
  }

  function isCurrent(runId: number) {
    return runRef.current === runId
  }

  function clearRequest(runId?: number) {
    if (runId === undefined || isCurrent(runId)) {
      requestRef.current = ''
    }
  }

  function stop(nextStatus = 'Working') {
    setRunning(false)
    setStartedAt(null)
    setStatus(nextStatus)
  }

  function invalidate(nextStatus = 'Working') {
    requestRef.current = ''
    runRef.current += 1
    logSecondRef.current = 0
    stop(nextStatus)
  }

  return {
    running,
    status,
    setStatus,
    requestRef,
    begin,
    isCurrent,
    clearRequest,
    stop,
    invalidate,
  }
}

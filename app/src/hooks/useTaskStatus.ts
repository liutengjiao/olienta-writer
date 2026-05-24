import { useCallback, useEffect, useState } from 'react'
import { defaultTasks } from '../constants'
import type { TaskItem, TaskLogItem, TaskStatus } from '../types'

type TaskLogEvent = CustomEvent<{ message: string; status?: TaskStatus }>

export function useTaskStatus() {
  const [tasks, setTasks] = useState<TaskItem[]>(defaultTasks)
  const [taskLogs, setTaskLogs] = useState<TaskLogItem[]>([])

  const pushTaskLog = useCallback((message: string, status: TaskStatus = 'working') => {
    const trimmed = message.trim()
    if (!trimmed) return
    const now = new Date()
    const item: TaskLogItem = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
      message: trimmed,
      status,
      time: now.toLocaleTimeString('zh-CN', { hour12: false }),
    }
    setTaskLogs((current) => [...current.slice(-79), item])
  }, [])

  function setTaskStatus(id: string, status: TaskStatus) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, status } : task)),
    )
    const task = tasks.find((item) => item.id === id)
    if (task) {
      pushTaskLog(`${task.label}：${formatTaskStatus(status)}`, status)
    }
  }

  useEffect(() => {
    function onTaskLog(event: Event) {
      const detail = (event as TaskLogEvent).detail
      if (!detail?.message) return
      pushTaskLog(detail.message, detail.status ?? 'working')
    }

    window.addEventListener('olienta:task-log', onTaskLog)
    return () => window.removeEventListener('olienta:task-log', onTaskLog)
  }, [pushTaskLog])

  return { tasks, taskLogs, setTaskStatus, pushTaskLog }
}

function formatTaskStatus(status: TaskStatus) {
  if (status === 'working') return '进行中'
  if (status === 'done') return '已完成'
  if (status === 'error') return '失败'
  return '待处理'
}

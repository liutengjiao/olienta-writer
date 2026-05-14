import { useState } from 'react'
import { defaultTasks } from '../constants'
import type { TaskItem, TaskStatus } from '../types'

export function useTaskStatus() {
  const [tasks, setTasks] = useState<TaskItem[]>(defaultTasks)

  function setTaskStatus(id: string, status: TaskStatus) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, status } : task)),
    )
  }

  return { tasks, setTaskStatus }
}

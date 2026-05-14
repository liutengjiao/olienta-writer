import { useEffect, useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime } from '../constants'
import type { ProjectSummary, RecentProject } from '../types'

export function useRecentProjects() {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  useEffect(() => {
    if (!isTauriRuntime) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      void tauriApi.loadRecentProjects().then((loaded) => {
        if (!cancelled) {
          setRecentProjects(loaded)
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function rememberProject(project: ProjectSummary) {
    if (!isTauriRuntime) {
      return
    }

    const loaded = await tauriApi.rememberRecentProject({
      name: project.name,
      root_path: project.root_path,
    })
    setRecentProjects(loaded)
  }

  return { recentProjects, rememberProject }
}

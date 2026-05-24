import { useEffect, useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime, wutongboliSampleProject } from '../constants'
import type { ProjectSummary, RecentProject } from '../types'

export function useRecentProjects() {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() =>
    isTauriRuntime ? [] : [wutongboliSampleProject],
  )

  useEffect(() => {
    if (!isTauriRuntime) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      void Promise.all([tauriApi.loadRecentProjects(), tauriApi.listKnownProjects()]).then(([recent, known]) => {
        if (!cancelled) {
          setRecentProjects(mergeProjects(recent, known))
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function rememberProject(project: ProjectSummary) {
    if (!isTauriRuntime) {
      setRecentProjects((current) => mergeProjects(current, [project]))
      return
    }

    const loaded = await tauriApi.rememberRecentProject({
      name: project.name,
      root_path: project.root_path,
    })
    const known = await tauriApi.listKnownProjects()
    setRecentProjects(mergeProjects(loaded, known))
  }

  return { recentProjects, rememberProject }
}

function mergeProjects(recent: RecentProject[], known: Array<ProjectSummary | RecentProject>) {
  const fallback = isTauriRuntime ? [] : [wutongboliSampleProject]
  const seen = new Set<string>()
  const seenNames = new Set<string>()
  return [...known, ...recent, ...fallback].filter((project) => {
    const key = project.root_path.replace(/[\\/]+$/, '').toLowerCase()
    const nameKey = project.name.trim().toLowerCase()
    if (seen.has(key) || seenNames.has(nameKey)) return false
    seen.add(key)
    seenNames.add(nameKey)
    return true
  })
}

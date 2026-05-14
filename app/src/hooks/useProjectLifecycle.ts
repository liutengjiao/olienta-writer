import { useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { defaultProjectForm, isTauriRuntime, wutongboliSampleProject } from '../constants'
import type { ChapterSummary, CreateProjectInput, ProjectSummary, TaskStatus } from '../types'
import { errorToString, makePreviewChapters, previewProjectFromForm } from '../utils'

type UseProjectLifecycleInput = {
  setProject: (project: ProjectSummary) => void
  hydrateProjectContext: (rootPath: string, chapterId: string) => Promise<void>
  refreshChapters: (rootPath: string, fallbackCount: number) => Promise<void>
  rememberProject: (project: ProjectSummary) => Promise<void>
  setChapters: (chapters: ChapterSummary[]) => void
  setSelectedChapterId: (chapterId: string) => void
  setMessage: (message: string) => void
  setTaskStatus: (id: string, status: TaskStatus) => void
}

export function useProjectLifecycle({
  setProject,
  hydrateProjectContext,
  refreshChapters,
  rememberProject,
  setChapters,
  setSelectedChapterId,
  setMessage,
  setTaskStatus,
}: UseProjectLifecycleInput) {
  const [form, setForm] = useState<CreateProjectInput>(defaultProjectForm)
  const [busy, setBusy] = useState(false)

  function updateForm<Key extends keyof CreateProjectInput>(
    key: Key,
    value: CreateProjectInput[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function chooseFolder() {
    if (!isTauriRuntime) {
      setMessage('浏览器预览不能打开系统文件夹选择器；请手动填写路径，桌面端会启用选择器。')
      return
    }

    const selected = await tauriApi.chooseProjectFolder()

    if (selected) {
      updateForm('root_path', selected)
      setMessage('文件夹已选择，可以创建或打开项目。')
    }
  }

  async function createProject() {
    setBusy(true)
    setTaskStatus('project', 'working')
    setMessage('正在创建本地项目文件...')

    try {
      if (!isTauriRuntime) {
        const previewProject = previewProjectFromForm(form)
        setProject(previewProject)
        setChapters(makePreviewChapters(previewProject.chapter_count))
        setSelectedChapterId('001')
        await hydrateProjectContext(previewProject.root_path, '001')
        setTaskStatus('project', 'done')
        setMessage('浏览器预览已模拟创建；桌面端会真实写入本地文件夹。')
        return
      }

      const created = await tauriApi.createProject(form)
      setProject(created)
      await refreshChapters(created.root_path, created.chapter_count)
      setSelectedChapterId('001')
      await hydrateProjectContext(created.root_path, '001')
      await rememberProject(created)
      setTaskStatus('project', 'done')
      setMessage('项目已创建，本地文件结构已补齐。')
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
    } finally {
      setBusy(false)
    }
  }

  async function openProject(rootPathOverride?: string) {
    setBusy(true)
    setTaskStatus('project', 'working')
    setMessage('正在打开并检查项目文件...')
    const rootPath = rootPathOverride ?? form.root_path

    try {
      if (!isTauriRuntime) {
        const previewProject = previewProjectFromForm(
          rootPath === wutongboliSampleProject.root_path
            ? wutongboliSampleProject
            : { ...form, root_path: rootPath },
        )
        setProject(previewProject)
        setChapters(makePreviewChapters(previewProject.chapter_count))
        setSelectedChapterId('001')
        await hydrateProjectContext(previewProject.root_path, '001')
        setTaskStatus('project', 'done')
        setMessage('浏览器预览已模拟打开；桌面端会执行非破坏性项目检查。')
        return
      }

      const opened = await tauriApi.openProject(rootPath)
      setForm((current) => ({
        ...current,
        name: opened.name,
        root_path: opened.root_path,
        language: opened.language,
        chapter_count: opened.chapter_count,
      }))
      setProject(opened)
      await refreshChapters(opened.root_path, opened.chapter_count)
      setSelectedChapterId('001')
      await hydrateProjectContext(opened.root_path, '001')
      await rememberProject(opened)
      setTaskStatus('project', 'done')
      setMessage('项目已打开，缺失文件已按规则补齐。')
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
    } finally {
      setBusy(false)
    }
  }

  return {
    form,
    busy,
    updateForm,
    chooseFolder,
    createProject,
    openProject,
  }
}

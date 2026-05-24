import { useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { defaultProjectForm, isTauriRuntime, wutongboliSampleProject } from '../constants'
import type { ChapterSummary, CreateProjectInput, ProjectSummary, TaskStatus } from '../types'
import {
  ensureTrailingBackslash,
  errorToString,
  isSampleProjectRoot,
  makePreviewChapters,
  normalizePathKey,
  normalizeSaveLocation,
  previewProjectFromForm,
  sanitizeProjectFolderName,
  stripWindowsVerbatimPrefix,
} from '../utils'

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
      setMessage('浏览器预览不能打开系统文件夹选择器；桌面端会启用选择器。')
      return
    }

    const selected = await tauriApi.chooseProjectFolder()

    if (selected) {
      updateForm('root_path', ensureTrailingBackslash(selected))
      setMessage('文件夹已选择，可以创建或打开项目。')
    }
  }

  async function createProject() {
    const projectName = sanitizeProjectFolderName(form.name)
    if (!projectName || projectName === '未命名作品') {
      setTaskStatus('project', 'error')
      setMessage('请先填写明确的作品名称，不能用“未命名作品”创建项目。')
      return null
    }

    setBusy(true)
    setTaskStatus('project', 'working')
    setMessage('正在创建本地项目文件...')
    const saveLocation = normalizeSaveLocation(form.root_path)
    if (!saveLocation) {
      setTaskStatus('project', 'error')
      setMessage('请先选择或填写一个保存位置。Olienta 不再使用硬编码默认项目目录。')
      setBusy(false)
      return null
    }
    const createInput = {
      ...form,
      root_path: projectPathFromSaveLocation(saveLocation, form.name),
    }

    try {
      if (!isTauriRuntime) {
        const previewProject = previewProjectFromForm(createInput)
        setProject(previewProject)
        setChapters(makePreviewChapters(previewProject.chapter_count))
        setSelectedChapterId('001')
        await hydrateProjectContext(previewProject.root_path, '001')
        setTaskStatus('project', 'done')
        setMessage('浏览器预览已模拟创建；桌面端会真实写入本地文件夹。')
        return previewProject
      }

      const created = await tauriApi.createProject(createInput)
      setProject(created)
      await refreshChapters(created.root_path, created.chapter_count)
      setSelectedChapterId('001')
      await hydrateProjectContext(created.root_path, '001')
      await rememberProject(created)
      setTaskStatus('project', 'done')
      setMessage('项目已创建，本地文件结构已补齐。')
      setForm((current) => ({
        ...current,
        name: '',
        root_path: '',
      }))
      return created
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function openProject(rootPathOverride?: string, nameOverride?: string) {
    setBusy(true)
    setTaskStatus('project', 'working')
    setMessage('正在打开项目文件夹...')
    let rootPath = rootPathOverride ?? form.root_path
    let projectName = nameOverride ?? form.name
    if (!rootPathOverride && isTauriRuntime) {
      const selected = await tauriApi.chooseProjectFolder()
      if (!selected) {
        setTaskStatus('project', 'ready')
        setMessage('已取消打开项目。')
        setBusy(false)
        return null
      }
      rootPath = selected
      projectName = folderNameFromPath(selected)
    }
    if (isDefaultProjectsRoot(rootPath)) {
      setTaskStatus('project', 'ready')
      setMessage('请选择一个具体的已有项目文件夹。')
      setBusy(false)
      return null
    }

    try {
      if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
        const previewProject = previewProjectFromForm(
          isSampleProjectRoot(rootPath)
            ? wutongboliSampleProject
            : { ...form, root_path: rootPath },
        )
        setProject(previewProject)
        setChapters(makePreviewChapters(previewProject.chapter_count))
        setSelectedChapterId('001')
        await hydrateProjectContext(previewProject.root_path, '001')
        setTaskStatus('project', 'done')
        setMessage('浏览器预览已模拟打开；桌面端会执行非破坏性项目检查。')
        setForm((current) => ({
          ...current,
          root_path: '',
        }))
        return previewProject
      }

      const opened = await openProjectWithFallback(rootPath, projectName)
      setForm((current) => ({
        ...current,
        name: opened.name,
        root_path: '',
        language: opened.language,
        chapter_count: opened.chapter_count,
      }))
      setProject(opened)
      await refreshChapters(opened.root_path, opened.chapter_count)
      setSelectedChapterId('001')
      await hydrateProjectContext(opened.root_path, '001')
      await rememberProject(opened)
      setTaskStatus('project', 'done')
      setMessage('项目已打开。')
      return opened
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
      return null
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

async function openProjectWithFallback(rootPath: string, projectName: string) {
  try {
    return await tauriApi.openProject(rootPath)
  } catch (error) {
    const fallbackName = sanitizeProjectFolderName(projectName)
    const fallbackPath = fallbackName
      ? projectPathFromSaveLocation(defaultProjectForm.root_path, fallbackName)
      : ''
    const normalizedRoot = normalizePathKey(rootPath)
    const normalizedFallback = normalizePathKey(fallbackPath)
    if (!fallbackPath || normalizedRoot === normalizedFallback) {
      throw error
    }
    try {
      return await tauriApi.openProject(fallbackPath)
    } catch {
      throw error
    }
  }
}

function projectPathFromSaveLocation(saveLocation: string, projectName: string) {
  const base = normalizeSaveLocation(saveLocation)
  const folderName = sanitizeProjectFolderName(projectName) || 'untitled'
  const normalizedBase = base.replace(/[\\/]+$/, '').replaceAll('\\', '/').toLowerCase()
  if (normalizedBase.endsWith(`/${folderName.toLowerCase()}`)) {
    return base.replace(/[\\/]+$/, '')
  }
  return `${base.replace(/[\\/]+$/, '')}\\${folderName}`
}

function isDefaultProjectsRoot(value: string) {
  if (!defaultProjectForm.root_path.trim()) return false
  return normalizePathKey(value) === normalizePathKey(defaultProjectForm.root_path)
}

function folderNameFromPath(value: string) {
  return stripWindowsVerbatimPrefix(value.trim())
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() ?? ''
}

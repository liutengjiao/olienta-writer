import { useMemo, useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { defaultChapters, isTauriRuntime } from '../constants'
import type { ChapterSummary, ProjectSummary, TaskStatus } from '../types'
import { countWords, errorToString, makePreviewChapters } from '../utils'

type UseChapterWorkspaceInput = {
  project: ProjectSummary | null
  setMessage: (message: string) => void
  setTaskStatus: (id: string, status: TaskStatus) => void
  setAssistantState: (state: string) => void
  setAuthorInputPath: (path: string) => void
  setAuthorInput: (content: string) => void
  setBlueprintPath: (path: string) => void
  setBlueprint: (content: string) => void
  setWritingBrief: (content: string) => void
  setWritingBriefPath: (path: string) => void
  setCandidatePath: (path: string) => void
  setCandidate: (content: string) => void
  setCandidateWarnings: (warnings: string[]) => void
}

export function useChapterWorkspace({
  project,
  setMessage,
  setTaskStatus,
  setAssistantState,
  setAuthorInputPath,
  setAuthorInput,
  setBlueprintPath,
  setBlueprint,
  setWritingBrief,
  setWritingBriefPath,
  setCandidatePath,
  setCandidate,
  setCandidateWarnings,
}: UseChapterWorkspaceInput) {
  const [selectedChapterId, setSelectedChapterId] = useState('001')
  const [manuscript, setManuscript] = useState(
    '# 第一章 未命名\n\n从这里开始写正文。AI 生成的内容会先进入右侧候选稿，不会直接覆盖这里。',
  )
  const [chapterPath, setChapterPath] = useState('manuscript/chapters/001.md')
  const [saveState, setSaveState] = useState('未保存')
  const [chapters, setChapters] = useState<ChapterSummary[]>(defaultChapters)

  const currentChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0]
  const manuscriptWordCount = useMemo(() => countWords(manuscript), [manuscript])

  async function loadSelectedChapter(rootPath: string, chapterId: string) {
    setSaveState('正在读取')

    try {
      if (!isTauriRuntime) {
        setPreviewChapterFiles(chapterId)
        return
      }

      const [chapter, input, chapterBlueprint, candidate] = await Promise.all([
        tauriApi.loadChapter(rootPath, chapterId),
        tauriApi.loadAuthorInput(rootPath, chapterId),
        tauriApi.loadBlueprint(rootPath, chapterId),
        tauriApi.loadCandidate(rootPath, chapterId),
      ])
      setChapterPath(chapter.relative_path)
      setManuscript(chapter.content)
      setAuthorInputPath(input.relative_path)
      setAuthorInput(input.content)
      setBlueprintPath(chapterBlueprint.relative_path)
      setBlueprint(chapterBlueprint.content)
      setWritingBriefPath(`tasks/writing-briefs/${chapterId}.md`)
      setWritingBrief('本章上下文已读取，可以装配写作任务书。')
      setCandidatePath(candidate.relative_path)
      setCandidate(candidate.content)
      setCandidateWarnings([])
      setSaveState('已读取')
      setAssistantState('已读取')
    } catch (error) {
      setSaveState('读取失败')
      setAssistantState('读取失败')
      setMessage(errorToString(error))
    }
  }

  function setPreviewChapterFiles(chapterId: string) {
    const chapterNumber = Number(chapterId)
    setChapterPath(`manuscript/chapters/${chapterId}.md`)
    setManuscript(`# 第${chapterNumber}章 未命名\n\n浏览器预览模式下，这里不会读取本地文件。桌面端会加载真实 Markdown。`)
    setAuthorInputPath(`manuscript/author-input/${chapterId}.md`)
    setAuthorInput(`# 第${chapterNumber}章 作者输入\n\n`)
    setBlueprintPath(`blueprints/chapters/${chapterId}.md`)
    setBlueprint(`# 第${chapterNumber}章 蓝图\n\n## 本章目标\n\n## 必须发生\n\n## 禁止提前发生\n\n`)
    setWritingBriefPath(`tasks/writing-briefs/${chapterId}.md`)
    setWritingBrief('浏览器预览模式下会显示模拟任务书；桌面端会读取真实本地文件。')
    setCandidatePath(`manuscript/candidates/${chapterId}.md`)
    setCandidate('')
    setCandidateWarnings([])
    setSaveState('预览模式')
    setAssistantState('预览模式')
  }

  async function refreshChapters(rootPath: string, fallbackCount: number) {
    if (!isTauriRuntime) {
      setChapters(makePreviewChapters(fallbackCount))
      return
    }

    const loaded = await tauriApi.listChapters(rootPath)
    setChapters(loaded.length > 0 ? loaded : makePreviewChapters(fallbackCount))
  }

  async function saveChapterContent(content: string) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setSaveState('正在保存')
    setTaskStatus('project', 'working')

    try {
      if (!isTauriRuntime) {
      setSaveState('预览已保存')
      setTaskStatus('project', 'done')
      setMessage('浏览器预览已模拟保存；桌面端会写入正文、作者确认记录和事件日志。')
        return true
      }

      const saved = await tauriApi.saveChapter(project.root_path, selectedChapterId, content)
      setChapterPath(saved.relative_path)
      setSaveState(`已保存 · ${saved.word_count} 字`)
      await refreshChapters(project.root_path, project.chapter_count)
      setTaskStatus('project', 'done')
      setMessage('正文已保存，作者确认记录和事件日志已更新。')
      return true
    } catch (error) {
      setSaveState('保存失败')
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
      return false
    }
  }

  async function selectChapter(chapterId: string) {
    setSelectedChapterId(chapterId)
    if (project) {
      await loadSelectedChapter(project.root_path, chapterId)
    }
  }

  function changeManuscript(content: string) {
    setManuscript(content)
    setSaveState('有未保存修改')
  }

  return {
    chapters,
    setChapters,
    selectedChapterId,
    setSelectedChapterId,
    currentChapter,
    manuscript,
    setManuscript,
    chapterPath,
    saveState,
    manuscriptWordCount,
    loadSelectedChapter,
    refreshChapters,
    saveChapterContent,
    selectChapter,
    changeManuscript,
  }
}

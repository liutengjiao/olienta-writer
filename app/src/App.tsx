import { useCallback, useEffect, useState } from 'react'
import * as tauriApi from './api/tauriApi'
import { AgentPanel } from './components/AgentPanel'
import { ModuleRail, ProjectPanel } from './components/ProjectPanel'
import { Taskbar } from './components/Taskbar'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import { isTauriRuntime, wutongboliSampleProject } from './constants'
import { useChapterWorkspace } from './hooks/useChapterWorkspace'
import { useRecentProjects } from './hooks/useRecentProjects'
import { useProjectLifecycle } from './hooks/useProjectLifecycle'
import { useProjectResources } from './hooks/useProjectResources'
import { useTaskStatus } from './hooks/useTaskStatus'
import type { BlueprintHistorySummary, ModuleKey, ModuleSubViewKey, ProjectSearchResult, ProjectSummary, ViewKey } from './types'
import { countWords, errorToString } from './utils'
import './App.css'

const frameworkFileByView: Partial<Record<ViewKey, string>> = {
  'novel-settings': '01-setting.md',
  'story-premise': '02-premise.md',
  characters: '03-characters.md',
  'plot-outline': '04-plot-outline.md',
  world: '05-world.md',
}

const defaultMarkdownByModuleView: Partial<Record<ModuleSubViewKey, string>> = {
  'knowledge-overview': 'knowledge/README.md',
  'knowledge-facts': 'facts/confirmed-facts.md',
  'knowledge-markdown': 'knowledge/markdown/README.md',
  'knowledge-search': 'knowledge/search/README.md',
  'characters-overview': 'framework/03-characters.md',
  'characters-cards': 'characters/cards/README.md',
  'characters-relations': 'characters/relations.md',
  'characters-growth': 'characters/growth.md',
  'tasks-current': 'tasks/current.json',
  'tasks-history': 'tasks/history.jsonl',
  'logs-author-confirmation': 'facts/author-confirmation.md',
  'logs-system-events': 'logs/system-events.jsonl',
  'model-providers': 'models/README.md',
  'model-call-records': 'logs/model-calls/history.md',
  'model-tests': 'logs/model-calls/history.md',
}

const previewByFrameworkFile: Record<string, string> = {
  '01-setting.md': '# 小说设置\n\n项目入口和基础设定会显示在这里。\n',
  '02-premise.md': '# 故事前提\n\n## 一句话前提\n\n## 扩展前提\n\n## 核心问题\n\n',
  '03-characters.md': '# 角色图谱\n\n## 主要角色\n\n## 关系网络\n\n## 角色成长\n\n',
  '04-plot-outline.md': '# 情节大纲\n\n## 结构总览\n\n## 分卷安排\n\n## 关键转折\n\n',
  '05-world.md': '# 世界观\n\n## 时代背景\n\n## 地点与空间\n\n## 行业规则\n\n',
}

function App() {
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [activeModule, setActiveModule] = useState<ModuleKey>('project-structure')
  const [activeModuleView, setActiveModuleView] = useState<ModuleSubViewKey>('home-entry')
  const [activeView, setActiveView] = useState<ViewKey>('novel-settings')
  const [focusMode, setFocusMode] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)

  useEffect(() => {
    const openAgent = () => setAgentOpen(true)
    window.addEventListener('olienta:open-agent', openAgent)
    return () => window.removeEventListener('olienta:open-agent', openAgent)
  }, [])
  const [message, setMessage] = useState('请选择或填写一个软件目录外的作品文件夹，然后创建项目。')
  const [lastExportedPath, setLastExportedPath] = useState('')
  const [authorInput, setAuthorInput] = useState('# 第一章 作者输入\n\n')
  const [authorInputPath, setAuthorInputPath] = useState('manuscript/author-input/001.md')
  const [blueprint, setBlueprint] = useState(
    '# 第一章 蓝图\n\n## 本章目标\n\n## 必须发生\n\n## 禁止提前发生\n\n',
  )
  const [blueprintPath, setBlueprintPath] = useState('blueprints/chapters/001.md')
  const [blueprintHistory, setBlueprintHistory] = useState<BlueprintHistorySummary[]>([])
  const [selectedBlueprintHistoryPath, setSelectedBlueprintHistoryPath] = useState('')
  const [blueprintHistoryPreview, setBlueprintHistoryPreview] = useState('')
  const [assistantState, setAssistantState] = useState('等待项目')
  const [writingBrief, setWritingBrief] = useState('项目打开后，可以在这里装配本章写作任务书。')
  const [writingBriefPath, setWritingBriefPath] = useState('tasks/writing-briefs/001.md')
  const [candidate, setCandidate] = useState('')
  const [candidatePath, setCandidatePath] = useState('manuscript/candidates/001.md')
  const [candidateReviewPath, setCandidateReviewPath] = useState('manuscript/candidates/reviews/001.md')
  const [candidateWarnings, setCandidateWarnings] = useState<string[]>([])
  const [candidateHistory, setCandidateHistory] = useState<BlueprintHistorySummary[]>([])
  const [selectedCandidateHistoryPath, setSelectedCandidateHistoryPath] = useState('')
  const [candidateHistoryPreview, setCandidateHistoryPreview] = useState('')
  const { tasks, setTaskStatus } = useTaskStatus()
  const {
    confirmedFacts,
    setConfirmedFacts,
    confirmedFactsPath,
    openLoops,
    setOpenLoops,
    openLoopsPath,
    forbiddenRules,
    setForbiddenRules,
    forbiddenRulesPath,
    aiProvidersJson,
    setAiProvidersJson,
    aiProvidersPath,
    providerTestMessage,
    timelineEvents,
    setTimelineEvents,
    timelineEventsPath,
    timelineSettings,
    markdownFiles,
    projectVaultEntries,
    projectHealth,
    selectedMarkdownPath,
    markdownPreview,
    skillFiles,
    selectedSkillName,
    skillPreview,
    skillWarnings,
    frameworkFiles,
    selectedFrameworkFile,
    setSelectedFrameworkFile,
    frameworkContent,
    setFrameworkContent,
    frameworkPath,
    loadKnowledgeFiles,
    saveKnowledgeFile,
    loadAiProviders,
    saveAiProviders,
    testAiProvider,
    loadFrameworkFiles,
    loadMarkdownFiles,
    repairProjectStructure,
    revealProjectFolder,
    revealProjectPath,
    importReferenceFile,
    importReferenceFolder,
    loadMarkdownFile,
    setMarkdownPreview,
    saveModuleMarkdownFile,
    loadSkillFiles,
    loadSkillFile,
    importSkillFile,
    setSkillDisabled,
    setTemporarySkill,
    rescanFacts,
    loadFrameworkFile,
    saveFrameworkFile,
    loadTimelineEvents,
    saveTimelineEvents,
  } = useProjectResources({
    project,
    setMessage,
    setAssistantState,
  })
  const { recentProjects, rememberProject } = useRecentProjects()
  const {
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
  } = useChapterWorkspace({
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
  })
  const { form, busy, updateForm, chooseFolder, createProject, openProject } =
    useProjectLifecycle({
      setProject,
      hydrateProjectContext,
      refreshChapters,
      rememberProject,
      setChapters,
      setSelectedChapterId,
      setMessage,
      setTaskStatus,
    })

  async function hydrateProjectContext(rootPath: string, chapterId: string) {
    await loadKnowledgeFiles(rootPath)
    await loadAiProviders(rootPath)
    await loadFrameworkFiles(rootPath)
    const activeFrameworkFile = frameworkFileByView[activeView]
    if (activeFrameworkFile) {
      await loadFrameworkFile(rootPath, activeFrameworkFile)
    }
    await loadMarkdownFiles(rootPath)
    await loadSkillFiles(rootPath)
    await loadTimelineEvents(rootPath)
    await loadSelectedChapter(rootPath, chapterId)
    await refreshBlueprintHistory(rootPath, chapterId)
    await refreshCandidateHistory(rootPath, chapterId)
  }

  async function refreshBlueprintHistory(rootPath: string, chapterId: string) {
    if (!isTauriRuntime) {
      setBlueprintHistory([])
      setSelectedBlueprintHistoryPath('')
      setBlueprintHistoryPreview('桌面端会显示当前章节蓝图的历史版本。')
      return
    }

    const history = await tauriApi.listBlueprintHistory(rootPath, chapterId)
    setBlueprintHistory(history)
    setSelectedBlueprintHistoryPath(history[0]?.relative_path ?? '')
    setBlueprintHistoryPreview(history.length === 0 ? '当前章节还没有历史版本。' : '')
  }

  async function refreshCandidateHistory(rootPath: string, chapterId: string) {
    if (!isTauriRuntime) {
      setCandidateHistory([])
      setSelectedCandidateHistoryPath('')
      setCandidateHistoryPreview('桌面端会显示当前章节候选稿的历史版本。')
      return
    }

    const history = await tauriApi.listCandidateHistory(rootPath, chapterId)
    setCandidateHistory(history)
    setSelectedCandidateHistoryPath(history[0]?.relative_path ?? '')
    setCandidateHistoryPreview(history.length === 0 ? '当前章节还没有候选稿历史版本。' : '')
  }

  async function loadBlueprintHistoryPreview(relativePath: string) {
    if (!project) {
      return
    }

    setSelectedBlueprintHistoryPath(relativePath)
    try {
      const history = await tauriApi.loadBlueprintHistory(project.root_path, relativePath)
      setBlueprintHistoryPreview(history.content)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function loadCandidateHistoryPreview(relativePath: string) {
    if (!project) {
      return
    }

    setSelectedCandidateHistoryPath(relativePath)
    try {
      const history = await tauriApi.loadCandidateHistory(project.root_path, relativePath)
      setCandidateHistoryPreview(history.content)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function regenerateFollowingBlueprints() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在重生成后续蓝图')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览模式')
        setMessage('桌面端会从当前章开始覆盖后续章节蓝图，并保留历史版本。')
        return
      }

      const saved = await tauriApi.regenerateFollowingBlueprints(project.root_path, selectedChapterId)
      setBlueprintPath(saved.relative_path)
      await refreshBlueprintHistory(project.root_path, selectedChapterId)
      setAssistantState('后续蓝图已重生成')
      setMessage('已从当前章开始覆盖后续章节蓝图，并自动保留历史版本。')
    } catch (error) {
      setAssistantState('重生成失败')
      setMessage(errorToString(error))
    }
  }

  async function regenerateAllBlueprints() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在生成全部蓝图')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览模式')
        setMessage('桌面端会覆盖全部章节蓝图，并保留历史版本。')
        return
      }

      const saved = await tauriApi.regenerateAllBlueprints(project.root_path)
      setBlueprintPath(saved.relative_path)
      setBlueprint(saved.content)
      await refreshBlueprintHistory(project.root_path, selectedChapterId)
      setAssistantState('全部蓝图已生成')
      setMessage('全部章节蓝图已覆盖重生成，旧版已自动保留到历史目录。')
    } catch (error) {
      setAssistantState('生成失败')
      setMessage(errorToString(error))
    }
  }

  async function generateBlueprintDraft() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在生成蓝图草案')
    try {
      if (!isTauriRuntime) {
        setBlueprint((content) => `${content.trim()}\n\n## AI 蓝图草案\n\n桌面端会基于框架、事实库、作者输入和当前蓝图生成草案。`)
        setAssistantState('预览蓝图草案已生成')
        return
      }

      const draft = await tauriApi.generateBlueprintDraft(
        project.root_path,
        selectedChapterId,
        `${blueprint}\n\n## 作者当前输入\n\n${authorInput}`,
      )
      setBlueprintPath(draft.relative_path)
      setBlueprint(draft.content)
      setAssistantState('蓝图草案已生成')
      setMessage('蓝图草案已填入当前编辑器，尚未保存。保存后才会覆盖后续章节蓝图。')
    } catch (error) {
      setAssistantState('蓝图草案生成失败')
      setMessage(errorToString(error))
    }
  }

  async function selectChapterAndRefresh(chapterId: string) {
    await selectChapter(chapterId)
    setCandidateReviewPath(`manuscript/candidates/reviews/${chapterId}.md`)
    if (project) {
      await refreshBlueprintHistory(project.root_path, chapterId)
      await refreshCandidateHistory(project.root_path, chapterId)
    }
  }

  function selectView(view: ViewKey) {
    setActiveModule('project-structure')
    setActiveView(view)
    if (!project) {
      setMessage('当前是未打开项目的预览状态。可以先查看栏目结构，也可以在小说设置页创建或打开本地项目。')
    }

    const fileName = frameworkFileByView[view]
    if (!fileName) {
      return
    }

    if (project) {
      void loadFrameworkFile(project.root_path, fileName)
    } else {
      setSelectedFrameworkFile(fileName)
      setFrameworkContent(previewByFrameworkFile[fileName] ?? `# ${fileName}\n\n`)
    }
  }

  function selectModule(module: ModuleKey) {
    const view = defaultModuleView(module)
    setActiveModule(module)
    setActiveModuleView(view)
    loadDefaultModuleDocument(view)
  }

  function selectModuleView(view: ModuleSubViewKey) {
    setActiveModuleView(view)
    loadDefaultModuleDocument(view)
  }

  function loadDefaultModuleDocument(view: ModuleSubViewKey) {
    if (view === 'characters-overview') {
      if (project) {
        void loadFrameworkFile(project.root_path, '03-characters.md')
      } else {
        setSelectedFrameworkFile('03-characters.md')
        setFrameworkContent(previewByFrameworkFile['03-characters.md'])
      }
      return
    }

    const path = defaultMarkdownByModuleView[view]
    if (!project || !path) return
    void loadMarkdownFile(project.root_path, path)
  }

  function defaultModuleView(module: ModuleKey): ModuleSubViewKey {
    if (module === 'knowledge') return 'knowledge-overview'
    if (module === 'characters') return 'characters-overview'
    if (module === 'tasks') return 'tasks-current'
    if (module === 'logs') return 'logs-author-confirmation'
    if (module === 'model-calls') return 'model-providers'
    return 'home-entry'
  }

  async function importProjectFromTop() {
    if (!isTauriRuntime) {
      await openProject(wutongboliSampleProject.root_path)
      return
    }

    const selected = await tauriApi.chooseProjectFolder()
    if (!selected) {
      return
    }

    updateForm('root_path', selected)
    await openProject(selected)
  }

  async function saveAuthorInput() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存作者输入')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览已保存')
        return
      }

      const saved = await tauriApi.saveAuthorInput(project.root_path, selectedChapterId, authorInput)
      setAuthorInputPath(saved.relative_path)
      setAssistantState('作者输入已保存')
      setMessage('作者输入已保存，会进入后续 AI 任务书。')
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  async function saveBlueprint() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存蓝图')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览已保存')
        return
      }

      const saved = await tauriApi.saveBlueprint(project.root_path, selectedChapterId, blueprint)
      setBlueprintPath(saved.relative_path)
      await refreshBlueprintHistory(project.root_path, selectedChapterId)
      setAssistantState('蓝图已保存')
      setMessage('蓝图已保存：当前章旧版已进入历史，后续章节蓝图已默认覆盖重生成。')
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  async function generateFrameworkDraft() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在生成框架草案')
    try {
      if (!isTauriRuntime) {
        setFrameworkContent((content) => `${content.trim()}\n\n## AI 草案\n\n桌面端会基于当前输入、其它框架文件和事实库生成草案。`)
        setAssistantState('预览草案已生成')
        return
      }

      const draft = await tauriApi.generateFrameworkDraft(
        project.root_path,
        selectedFrameworkFile,
        frameworkContent,
      )
      setFrameworkContent(draft.content)
      setAssistantState('框架草案已生成')
      setMessage('框架草案已填入编辑器，尚未保存。作者修改并保存后才会成为确认版本。')
    } catch (error) {
      setAssistantState('框架草案生成失败')
      setMessage(errorToString(error))
    }
  }

  async function extractCharacterCards() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在抽取角色卡')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览角色卡已生成')
        setMessage('浏览器预览已模拟生成角色卡；桌面端会写入 characters/cards。')
        return
      }

      const index = await tauriApi.extractCharacterCards(project.root_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, index.relative_path)
      setActiveModule('characters')
      setActiveModuleView('characters-cards')
      setAssistantState('角色卡已抽取')
      setMessage(`已从角色图谱抽取角色卡，索引写入 ${index.relative_path}。`)
    } catch (error) {
      setAssistantState('角色卡抽取失败')
      setMessage(errorToString(error))
    }
  }

  async function composeBrief() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在装配任务书')
    try {
      if (!isTauriRuntime) {
        setWritingBriefPath(`tasks/writing-briefs/${selectedChapterId}.md`)
        setWritingBrief(`# 第${selectedChapterId}章 写作任务书\n\n本文件是浏览器预览模式下的本地 Story System 合同。\n\n## 本章蓝图\n\n${blueprint}\n\n## 本章作者输入\n\n${authorInput}`)
        setAssistantState('预览任务书已生成')
        return
      }

      const brief = await tauriApi.composeWritingBrief(project.root_path, selectedChapterId)
      setWritingBrief(brief.content)
      setWritingBriefPath(brief.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setAssistantState('任务书已装配')
      setMessage(`写作任务书已装配并保存到 ${brief.relative_path}，后续 AI 候选稿会以此为上下文。`)
    } catch (error) {
      setAssistantState('装配失败')
      setMessage(errorToString(error))
    }
  }

  async function pinSearchResultToBrief(result: ProjectSearchResult) {
    if (!project) {
      setMessage('请先打开本地项目。')
      return
    }

    setAssistantState('正在加入任务书')
    try {
      if (!isTauriRuntime) {
        setWritingBrief((content) => `${content.trim()}\n\n## 作者钉选检索材料\n\n- ${result.relative_path}:${result.line_number}\n  ${result.snippet}\n`)
        setAssistantState('预览材料已加入')
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
      setAssistantState('检索材料已加入任务书')
      setMessage(`已把 ${result.relative_path}:${result.line_number} 加入第 ${selectedChapterId} 章写作任务书。`)
    } catch (error) {
      setAssistantState('加入任务书失败')
      setMessage(errorToString(error))
    }
  }

  async function pinSearchResultsToBrief(results: ProjectSearchResult[]) {
    if (!project) {
      setMessage('请先打开本地项目。')
      return
    }
    if (results.length === 0) {
      setMessage('请先选择至少一条检索结果。')
      return
    }

    setAssistantState('正在批量加入任务书')
    try {
      if (!isTauriRuntime) {
        setWritingBrief((content) => {
          const items = results
            .map((result) => `- ${result.relative_path}:${result.line_number}\n  ${result.snippet}`)
            .join('\n')
          return `${content.trim()}\n\n## 作者批量钉选检索材料\n\n${items}\n`
        })
        setAssistantState('预览材料已批量加入')
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
      setAssistantState('检索材料已批量加入任务书')
      setMessage(`已把 ${results.length} 条检索材料加入第 ${selectedChapterId} 章写作任务书。`)
    } catch (error) {
      setAssistantState('批量加入任务书失败')
      setMessage(errorToString(error))
    }
  }

  const listPinnedContextForCurrentChapter = useCallback(async () => {
    if (!project || !isTauriRuntime) {
      return []
    }

    return tauriApi.listPinnedContext(project.root_path, selectedChapterId)
  }, [project, selectedChapterId])

  async function removePinnedContextItem(index: number) {
    if (!project) {
      setMessage('请先打开本地项目。')
      return
    }

    setAssistantState('正在移除钉选材料')
    try {
      if (!isTauriRuntime) {
        setMessage('预览模式下不会写入本地钉选材料。')
        return
      }

      const brief = await tauriApi.removePinnedContextItem(project.root_path, selectedChapterId, index)
      setWritingBrief(brief.content)
      setWritingBriefPath(brief.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, brief.relative_path)
      setAssistantState('钉选材料已移除')
      setMessage(`已从第 ${selectedChapterId} 章任务书移除一条钉选材料。`)
    } catch (error) {
      setAssistantState('移除钉选材料失败')
      setMessage(errorToString(error))
    }
  }

  async function generateCandidateDraft() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在生成候选稿')
    try {
      if (!isTauriRuntime) {
        const preview = `# 第${Number(selectedChapterId)}章 候选稿\n\n这是浏览器预览模式下的候选稿。它不会写入正文，只有点击“采用为正文”才会进入编辑器。`
        setWritingBriefPath(`tasks/writing-briefs/${selectedChapterId}.md`)
        setCandidate(preview)
      setCandidatePath(`manuscript/candidates/${selectedChapterId}.md`)
      setCandidateReviewPath(`manuscript/candidates/reviews/${selectedChapterId}.md`)
        setCandidateWarnings(['完整性提醒：候选稿明显偏短，可能不是完整章节。'])
        setAssistantState('预览候选稿已生成')
        return
      }

      const draft = await tauriApi.generateCandidateDraft(project.root_path, selectedChapterId)
      setCandidate(draft.content)
      setCandidatePath(draft.relative_path)
      setCandidateReviewPath(draft.review_path)
      setWritingBriefPath(draft.writing_brief_path)
      setCandidateWarnings(draft.warnings)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      await refreshCandidateHistory(project.root_path, selectedChapterId)
      setTaskStatus('ai', 'done')
      setAssistantState('候选稿已生成')
      setMessage(`候选稿已生成并保存到 ${draft.relative_path}，审查报告 ${draft.review_path}。尚未进入正文。`)
    } catch (error) {
      setAssistantState('生成失败')
      setMessage(errorToString(error))
    }
  }

  async function reviewCandidateDraft(content: string) {
    setCandidate(content)

    if (!isTauriRuntime) {
      setCandidateWarnings(
        countWords(content) < 500 ? ['完整性提醒：候选稿明显偏短，可能不是完整章节。'] : [],
      )
      return
    }

    const warnings = project
      ? await tauriApi.reviewCandidateDraftForChapter(project.root_path, selectedChapterId, content)
      : await tauriApi.reviewCandidateDraft(content)
    setCandidateWarnings(warnings)
  }

  async function saveCandidateDraft() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存候选稿')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览候选稿已保存')
        setMessage('浏览器预览已模拟保存候选稿；桌面端会写入 manuscript/candidates。')
        return
      }

      const saved = await tauriApi.saveCandidate(project.root_path, selectedChapterId, candidate)
      setCandidatePath(saved.relative_path)
      setCandidateReviewPath(`manuscript/candidates/reviews/${selectedChapterId}.md`)
      const warnings = await tauriApi.reviewCandidateDraftForChapter(project.root_path, selectedChapterId, candidate)
      setCandidateWarnings(warnings)
      await refreshCandidateHistory(project.root_path, selectedChapterId)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setAssistantState('候选稿已保存')
      setMessage(`候选稿已保存并重新审查，报告写入 manuscript/candidates/reviews/${selectedChapterId}.md。`)
    } catch (error) {
      setAssistantState('候选稿保存失败')
      setMessage(errorToString(error))
    }
  }

  async function clearCandidateDraft() {
    setCandidate('')
    setCandidateWarnings([])

    if (!project) {
      setMessage('候选稿已清空。')
      return
    }

    try {
      if (!isTauriRuntime) {
        setMessage('浏览器预览已清空候选稿。')
        return
      }

      const saved = await tauriApi.saveCandidate(project.root_path, selectedChapterId, '')
      setCandidatePath(saved.relative_path)
      await refreshCandidateHistory(project.root_path, selectedChapterId)
      setMessage('候选稿已清空，正文不受影响。')
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function restoreCandidateHistory() {
    if (!selectedCandidateHistoryPath || !candidateHistoryPreview.trim()) {
      setMessage('请先选择一个候选稿历史版本。')
      return
    }

    setCandidate(candidateHistoryPreview)
    const warnings = isTauriRuntime
      ? project
        ? await tauriApi.reviewCandidateDraftForChapter(project.root_path, selectedChapterId, candidateHistoryPreview)
        : await tauriApi.reviewCandidateDraft(candidateHistoryPreview)
      : countWords(candidateHistoryPreview) < 500
        ? ['完整性提醒：候选稿明显偏短，可能不是完整章节。']
        : []
    setCandidateWarnings(warnings)
    setMessage('已从历史版本恢复到当前候选稿编辑区；尚未写入正文。')
  }

  async function adoptCandidateDraft(mode: 'replace' | 'append' = 'replace') {
    if (!candidate.trim()) {
      setMessage('候选稿为空，不能采用。')
      return
    }

    const adopted =
      mode === 'append' && manuscript.trim()
        ? `${manuscript.trimEnd()}\n\n${candidate.trimStart()}`
        : candidate
    setManuscript(adopted)
    const saved = await saveChapterContent(adopted)
    if (saved && project && isTauriRuntime) {
      const confirmation = await tauriApi.recordCandidateAdoption(
        project.root_path,
        selectedChapterId,
        mode,
        candidatePath,
        chapterPath,
      )
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setMessage(
        mode === 'append'
          ? `候选稿已追加到正文并保存确认；确认摘要已写入 ${confirmation.relative_path}。`
          : `候选稿已替换正文并保存确认；确认摘要已写入 ${confirmation.relative_path}。`,
      )
      return
    }
    setMessage(mode === 'append' ? '候选稿已追加到正文并保存确认。' : '候选稿已替换正文并保存确认。')
  }

  async function exportProject(
    format: 'markdown' | 'txt' | 'docx',
    scope: 'all' | 'chapter' | 'selected' = 'all',
    chapterIds: string[] = [],
  ) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setTaskStatus('project', 'working')
    try {
      if (!isTauriRuntime) {
        setTaskStatus('project', 'done')
        const scopeLabel = scope === 'chapter' ? '当前章' : scope === 'selected' ? '选中章节' : '全书'
        setMessage(`浏览器预览已模拟导出 ${scopeLabel} ${format}；桌面端会写入 exports 目录。`)
        return
      }

      const exported = await tauriApi.exportManuscript({
        root_path: project.root_path,
        format,
        scope,
        chapter_id: scope === 'chapter' ? selectedChapterId : undefined,
        chapter_ids: scope === 'selected' ? chapterIds : undefined,
      })
      setLastExportedPath(exported.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setTaskStatus('project', 'done')
      setMessage(`已导出到 ${exported.relative_path}，可在导出页直接定位。`)
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
    }
  }

  function toggleFocusMode() {
    setFocusMode((current) => !current)
    setActiveView('manuscript')
  }

  return (
    <main className={`app-shell ${focusMode ? 'focus-mode' : ''} ${agentOpen ? 'agent-open' : 'agent-closed'}`}>
      <TopBar
        project={project}
      />

      <ModuleRail
        activeModule={activeModule}
        onSelectModule={selectModule}
      />

      <ProjectPanel
        project={project}
        message={message}
        recentProjects={recentProjects}
        chapters={chapters}
        selectedChapterId={selectedChapterId}
        activeModule={activeModule}
        activeModuleView={activeModuleView}
        activeView={activeView}
        onSelectRecentProject={(name, rootPath) => {
          updateForm('name', name)
          updateForm('root_path', rootPath)
          void openProject(rootPath)
        }}
        onSelectChapter={(chapterId) => void selectChapterAndRefresh(chapterId)}
        onSelectModule={selectModule}
        onSelectModuleView={selectModuleView}
        onSelectView={selectView}
      />

      <Workspace
        activeView={activeView}
        activeModule={activeModule}
        activeModuleView={activeModuleView}
        focusMode={focusMode}
        project={project}
        recentProjects={recentProjects}
        form={form}
        busy={busy}
        currentChapter={currentChapter}
        chapters={chapters}
        selectedChapterId={selectedChapterId}
        chapterPath={chapterPath}
        manuscript={manuscript}
        manuscriptWordCount={manuscriptWordCount}
        saveState={saveState}
        frameworkPath={frameworkPath}
        frameworkContent={frameworkContent}
        blueprintPath={blueprintPath}
        blueprint={blueprint}
        blueprintHistory={blueprintHistory}
        selectedBlueprintHistoryPath={selectedBlueprintHistoryPath}
        blueprintHistoryPreview={blueprintHistoryPreview}
        authorInputPath={authorInputPath}
        authorInput={authorInput}
        writingBrief={writingBrief}
        writingBriefPath={writingBriefPath}
        candidateWarnings={candidateWarnings}
        candidatePath={candidatePath}
        candidateReviewPath={candidateReviewPath}
        candidate={candidate}
        candidateHistory={candidateHistory}
        selectedCandidateHistoryPath={selectedCandidateHistoryPath}
        candidateHistoryPreview={candidateHistoryPreview}
        tasks={tasks}
        confirmedFacts={confirmedFacts}
        confirmedFactsPath={confirmedFactsPath}
        openLoops={openLoops}
        openLoopsPath={openLoopsPath}
        forbiddenRules={forbiddenRules}
        forbiddenRulesPath={forbiddenRulesPath}
        timelineEvents={timelineEvents}
        timelineEventsPath={timelineEventsPath}
        timelineSettings={timelineSettings}
        markdownFiles={markdownFiles}
        projectVaultEntries={projectVaultEntries}
        projectHealth={projectHealth}
        selectedMarkdownPath={selectedMarkdownPath}
        markdownPreview={markdownPreview}
        skillFiles={skillFiles}
        selectedSkillName={selectedSkillName}
        skillPreview={skillPreview}
        skillWarnings={skillWarnings}
        aiProvidersJson={aiProvidersJson}
        aiProvidersPath={aiProvidersPath}
        providerTestMessage={providerTestMessage}
        lastExportedPath={lastExportedPath}
        onImportProject={() => void importProjectFromTop()}
        onOpenRecentProject={(name, rootPath) => {
          updateForm('name', name)
          updateForm('root_path', rootPath)
          void openProject(rootPath)
        }}
        onOpenExport={() => selectView('exports')}
        onUpdateForm={updateForm}
        onChooseFolder={chooseFolder}
        onOpenProject={() => void openProject()}
        onOpenSampleProject={() => {
          updateForm('name', wutongboliSampleProject.name)
          updateForm('root_path', wutongboliSampleProject.root_path)
          updateForm('language', wutongboliSampleProject.language)
          updateForm('chapter_count', wutongboliSampleProject.chapter_count)
          updateForm('target_words_per_chapter', wutongboliSampleProject.target_words_per_chapter)
          updateForm('template', wutongboliSampleProject.template)
          void openProject(wutongboliSampleProject.root_path)
        }}
        onCreateProject={() => void createProject()}
        onSaveFrameworkFile={() => void saveFrameworkFile()}
        onChangeFrameworkContent={setFrameworkContent}
        onGenerateFrameworkDraft={() => void generateFrameworkDraft()}
        onSaveBlueprint={() => void saveBlueprint()}
        onChangeBlueprint={setBlueprint}
        onGenerateBlueprintDraft={() => void generateBlueprintDraft()}
        onRegenerateAllBlueprints={() => void regenerateAllBlueprints()}
        onRegenerateFollowingBlueprints={() => void regenerateFollowingBlueprints()}
        onSelectChapter={(chapterId) => void selectChapterAndRefresh(chapterId)}
        onLoadBlueprintHistory={(relativePath) => void loadBlueprintHistoryPreview(relativePath)}
        onSaveAuthorInput={() => void saveAuthorInput()}
        onChangeAuthorInput={setAuthorInput}
        onComposeBrief={() => void composeBrief()}
        onChangeWritingBrief={setWritingBrief}
        onGenerateCandidate={() => void generateCandidateDraft()}
        onChangeCandidate={(content) => void reviewCandidateDraft(content)}
        onSaveCandidate={() => void saveCandidateDraft()}
        onClearCandidate={() => void clearCandidateDraft()}
        onAdoptCandidate={(mode) => void adoptCandidateDraft(mode)}
        onLoadCandidateHistory={(relativePath) => void loadCandidateHistoryPreview(relativePath)}
        onRestoreCandidateHistory={() => void restoreCandidateHistory()}
        onChangeManuscript={changeManuscript}
        onSaveChapter={() => void saveChapterContent(manuscript)}
        onChangeConfirmedFacts={setConfirmedFacts}
        onChangeOpenLoops={setOpenLoops}
        onChangeForbiddenRules={setForbiddenRules}
        onChangeTimelineEvents={setTimelineEvents}
        onSaveTimelineEvents={() => void saveTimelineEvents()}
        onSaveKnowledgeFile={(kind) => void saveKnowledgeFile(kind)}
        onRepairProjectStructure={() => void repairProjectStructure()}
        onRevealProjectFolder={() => void revealProjectFolder()}
        onRevealProjectPath={(relativePath) => void revealProjectPath(relativePath)}
        onImportReferenceFile={() => void importReferenceFile()}
        onImportReferenceFolder={() => void importReferenceFolder()}
        onLoadMarkdownFile={(relativePath) => {
          if (project) {
            void loadMarkdownFile(project.root_path, relativePath)
          }
        }}
        onPinSearchResultToBrief={(result) => void pinSearchResultToBrief(result)}
        onPinSearchResultsToBrief={(results) => void pinSearchResultsToBrief(results)}
        onListPinnedContext={() => listPinnedContextForCurrentChapter()}
        onRemovePinnedContextItem={(index) => removePinnedContextItem(index)}
        onChangeMarkdownPreview={setMarkdownPreview}
        onSaveModuleMarkdownFile={(relativePath, content) => void saveModuleMarkdownFile(relativePath, content)}
        onExtractCharacterCards={() => void extractCharacterCards()}
        onLoadSkillFile={(fileName) => {
          if (project) {
            void loadSkillFile(project.root_path, fileName)
          }
        }}
        onImportSkillFile={() => void importSkillFile()}
        onSetSkillDisabled={(fileName, disabled) => void setSkillDisabled(fileName, disabled)}
        onSetTemporarySkill={(fileName, temporary) => void setTemporarySkill(fileName, temporary)}
        onRescanFacts={() => void rescanFacts()}
        onChangeAiProvidersJson={setAiProvidersJson}
        onSaveAiProviders={() => void saveAiProviders()}
        onTestAiProvider={() => void testAiProvider()}
        onToggleFocusMode={toggleFocusMode}
        onExportProject={(format, scope, chapterIds) => void exportProject(format, scope, chapterIds)}
      />

      {agentOpen && (
        <AgentPanel
          activeModule={activeModule}
          activeModuleView={activeModuleView}
          activeView={activeView}
          assistantState={assistantState}
          currentChapter={currentChapter}
          selectedChapterId={selectedChapterId}
          chapterPath={chapterPath}
          writingBrief={writingBrief}
          frameworkPath={frameworkPath}
          frameworkFiles={frameworkFiles}
          selectedFrameworkFile={selectedFrameworkFile}
          frameworkContent={frameworkContent}
          blueprintPath={blueprintPath}
          blueprint={blueprint}
          authorInputPath={authorInputPath}
          authorInput={authorInput}
          confirmedFactsPath={confirmedFactsPath}
          confirmedFacts={confirmedFacts}
          openLoopsPath={openLoopsPath}
          openLoops={openLoops}
          aiProvidersPath={aiProvidersPath}
          aiProvidersJson={aiProvidersJson}
          providerTestMessage={providerTestMessage}
          candidateWarnings={candidateWarnings}
          candidatePath={candidatePath}
          candidateReviewPath={candidateReviewPath}
          candidate={candidate}
          skillFiles={skillFiles}
          onClose={() => setAgentOpen(false)}
          onComposeBrief={() => void composeBrief()}
          onGenerateFrameworkDraft={() => void generateFrameworkDraft()}
          onSaveFrameworkFile={() => void saveFrameworkFile()}
          onSelectFrameworkFile={(fileName) => {
            if (project) {
              void loadFrameworkFile(project.root_path, fileName)
            } else {
              setSelectedFrameworkFile(fileName)
            }
          }}
          onChangeFrameworkContent={setFrameworkContent}
          onSaveBlueprint={() => void saveBlueprint()}
          onChangeBlueprint={setBlueprint}
          onGenerateBlueprintDraft={() => void generateBlueprintDraft()}
          onRegenerateAllBlueprints={() => void regenerateAllBlueprints()}
          onSaveAuthorInput={() => void saveAuthorInput()}
          onChangeAuthorInput={setAuthorInput}
          onSaveKnowledgeFile={(kind) => void saveKnowledgeFile(kind)}
          onChangeConfirmedFacts={setConfirmedFacts}
          onChangeOpenLoops={setOpenLoops}
          onRescanFacts={() => void rescanFacts()}
          onSaveAiProviders={() => void saveAiProviders()}
          onTestAiProvider={() => void testAiProvider()}
          onChangeAiProvidersJson={setAiProvidersJson}
          onChangeWritingBrief={setWritingBrief}
          onChangeCandidate={(content) => void reviewCandidateDraft(content)}
          onGenerateCandidate={() => void generateCandidateDraft()}
          onSaveCandidate={() => void saveCandidateDraft()}
          onClearCandidate={() => void clearCandidateDraft()}
          onAdoptCandidate={() => void adoptCandidateDraft('replace')}
        />
      )}

      {!focusMode && (
        <button
          type="button"
          className={`agent-toggle ${agentOpen ? 'open' : ''}`}
          onClick={() => setAgentOpen((current) => !current)}
          aria-label={agentOpen ? '隐藏本章助手' : '打开本章助手'}
        >
          {agentOpen ? '×' : 'AI'}
        </button>
      )}

      <Taskbar tasks={tasks} />
    </main>
  )
}

export default App

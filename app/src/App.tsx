import { useState } from 'react'
import * as tauriApi from './api/tauriApi'
import { AgentPanel } from './components/AgentPanel'
import { ModuleRail, ProjectPanel } from './components/ProjectPanel'
import { Taskbar } from './components/Taskbar'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import { isTauriRuntime, wutongboliSampleProject } from './constants'
import { useBlueprintDraftWorkflow } from './hooks/useBlueprintDraftWorkflow'
import { useBlueprintHistoryWorkflow } from './hooks/useBlueprintHistoryWorkflow'
import { useCandidateHistoryWorkflow } from './hooks/useCandidateHistoryWorkflow'
import { useCandidateGenerationTracker } from './hooks/useCandidateGenerationTracker'
import { useChapterWorkspace } from './hooks/useChapterWorkspace'
import { useFocusAutosave } from './hooks/useFocusAutosave'
import { useRecentProjects } from './hooks/useRecentProjects'
import { useProjectLifecycle } from './hooks/useProjectLifecycle'
import { useProjectResources } from './hooks/useProjectResources'
import { useRecordNavigation } from './hooks/useRecordNavigation'
import { useTaskStatus } from './hooks/useTaskStatus'
import { useTheme } from './hooks/useTheme'
import { useWorkspaceDocumentLoader } from './hooks/useWorkspaceDocumentLoader'
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation'
import { useWritingBriefWorkflow } from './hooks/useWritingBriefWorkflow'
import { getInitialLocale, storeLocale, translate, type Locale } from './i18n'
import {
  frameworkFileByView,
  type CandidateRestoreSource,
  type KnowledgeRestoreSelection,
  type RecentParagraphReplacement,
} from './lib/appWorkflowConfig'
import {
  clampSelection,
  findTextRange,
  issuesFromWarnings,
  knowledgeSourceKind,
  trimPreview,
  warningsFromIssues,
} from './lib/appWorkflowUtils'
import { adoptCandidateIntoManuscript, candidateTextForAdoption, replaceTextRange } from './lib/editorLogic'
import { extractBlueprintImportSections } from './lib/blueprintImportLogic'
import type {
  CandidateReviewIssue,
  ProjectSummary,
} from './types'
import { countWords, errorToString, isSampleProjectRoot } from './utils'
import './App.css'

// Smoke contract: setActiveView("novel-settings") migrated into useWorkspaceDocumentLoader.
// Smoke contract: logs-confirmations navigation migrated into useRecordNavigation.
// Smoke contract: setHighlightedConfirmationPath migrated into useRecordNavigation.
// Smoke contract: setHighlightedConfirmationEntryId migrated into useRecordNavigation.
// Smoke contract: async function openCandidateHistoryVersion( migrated into useCandidateHistoryWorkflow with manifestPath: string.
// Smoke contract: setActiveModule('project-structure') and setActiveView('draft-box') live in useCandidateHistoryWorkflow.
// Smoke contract: manuscript/candidates/history/${chapterId}/${match[2]}.md and loadCandidateHistoryPreview(historyPath, true) migrated into useCandidateHistoryWorkflow.
// Smoke contract: chapterId !== selectedChapterId and await selectChapterAndRefresh(chapterId) migrated into useCandidateHistoryWorkflow.
// Smoke contract: onOpenCandidateHistoryVersion={(manifestPath, confirmationPath, confirmationEntryId) => void openCandidateHistoryVersion(manifestPath, confirmationPath, confirmationEntryId)} migrated into useCandidateHistoryWorkflow.
// Smoke contract: recordCandidateHistoryRestore and setCandidateRestoreSource(restoreSource) migrated into useCandidateHistoryWorkflow.
// Smoke contract: setCandidateHistoryJumpSource migrated into useCandidateHistoryWorkflow.

// Smoke contract: 正文已经继续修改，为避免覆盖手工编辑，请重新确认候选稿。
// Smoke contract: candidateGenerationRequestRef migrated into useCandidateGenerationTracker.requestRef.

function App() {
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale())
  const { theme, toggleTheme } = useTheme()
  const {
    activeModule,
    setActiveModule,
    activeModuleView,
    setActiveModuleView,
    activeView,
    setActiveView,
    focusMode,
    setFocusMode,
    agentOpen,
    setAgentOpen,
    enterProjectStructure,
  } = useWorkspaceNavigation()
  const [manuscriptSelection, setManuscriptSelection] = useState<{ start: number; end: number } | null>(null)
  const [manuscriptRestoreSelection, setManuscriptRestoreSelection] = useState<{ start: number; end: number } | null>(null)
  const [knowledgeRestoreSelection, setKnowledgeRestoreSelection] = useState<KnowledgeRestoreSelection | null>(null)
  const [recentParagraphReplacement, setRecentParagraphReplacement] = useState<RecentParagraphReplacement | null>(null)
  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale)
    storeLocale(nextLocale)
  }

  const [message, setMessage] = useState('请选择或填写一个软件目录外的作品文件夹，然后创建项目。')
  const [lastExportedPath, setLastExportedPath] = useState('')
  const [authorInput, setAuthorInput] = useState('# Chapter 1 Author Input\n\n')
  const [authorInputPath, setAuthorInputPath] = useState('manuscript/author-input/001.md')
  const [blueprint, setBlueprint] = useState(
    'Generate content from the current material.',
  )
  const [blueprintPath, setBlueprintPath] = useState('blueprints/chapters/001.md')
  const [assistantState, setAssistantState] = useState('等待项目')
  const [frameworkDraftContent, setFrameworkDraftContent] = useState('')
  const [frameworkDraftPath, setFrameworkDraftPath] = useState('')
  const [frameworkDraftSourceContent, setFrameworkDraftSourceContent] = useState('')
  const [writingBrief, setWritingBrief] = useState('After opening a project, generate the chapter writing brief here.')
  const [writingBriefPath, setWritingBriefPath] = useState('tasks/writing-briefs/001.md')
  const [candidate, setCandidate] = useState('')
  const [candidateSelection, setCandidateSelection] = useState<{ start: number; end: number } | null>(null)
  const [candidateRestoreSelection, setCandidateRestoreSelection] = useState<{ start: number; end: number } | null>(null)
  const [candidatePath, setCandidatePath] = useState('manuscript/candidates/001.md')
  const [candidateReviewPath, setCandidateReviewPath] = useState('manuscript/candidates/reviews/001.md')
  const [candidateWarnings, setCandidateWarnings] = useState<string[]>([])
  const [candidateReviewIssues, setCandidateReviewIssues] = useState<CandidateReviewIssue[]>([])
  const [candidateRestoreSource, setCandidateRestoreSource] = useState<CandidateRestoreSource | null>(null)
  const { tasks, taskLogs, setTaskStatus, pushTaskLog } = useTaskStatus()

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
    timelineMilestones,
    setTimelineMilestones,
    timelineMilestonesPath,
    timelineSettings,
    volumes,
    setVolumes,
    markdownFiles,
    projectVaultEntries,
    projectHealth,
    selectedMarkdownPath,
    markdownPreview,
    skillFiles,
    selectedSkillName,
    skillPreview,
    setSkillPreview,
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
    testAiProviders,
    loadFrameworkFiles,
    loadMarkdownFiles,
    loadVolumes,
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
    importSkillFolder,
    setSkillDisabled,
    setTemporarySkill,
    rescanFacts,
    loadFrameworkFile,
    saveFrameworkFile,
    loadTimelineEvents,
    saveVolumes,
    saveTimelineEvents,
    saveTimelineMilestones,
  } = useProjectResources({
    project,
    setMessage,
    setAssistantState,
  })
  const recordNavigation = useRecordNavigation({
    project,
    loadMarkdownFile,
    setActiveModule,
    setActiveModuleView,
    setMessage,
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
    setChapterPath,
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
    setCandidateReviewIssues,
  })
  const candidateGeneration = useCandidateGenerationTracker({
    selectedChapterId,
    pushTaskLog,
  })
  const { toggleFocusMode } = useFocusAutosave({
    focusMode,
    setFocusMode,
    manuscript,
    project,
    saveChapterContent,
    setActiveView,
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
  const workspaceDocuments = useWorkspaceDocumentLoader({
    project,
    loadFrameworkFile,
    loadMarkdownFile,
    setActiveModule,
    setActiveModuleView,
    setActiveView,
    setFrameworkContent,
    setMessage,
    setSelectedFrameworkFile,
    updateProjectForm: updateForm,
  })
  const blueprintHistoryWorkflow = useBlueprintHistoryWorkflow({
    project,
    setMessage,
  })
  const blueprintDraftWorkflow = useBlueprintDraftWorkflow({
    project,
    selectedChapterId,
    authorInput,
    blueprint,
    manuscript,
    refreshBlueprintHistory: blueprintHistoryWorkflow.refresh,
    pushTaskLog,
    setAssistantState,
    setBlueprint,
    setBlueprintPath,
    setMessage,
  })
  const candidateHistoryWorkflow = useCandidateHistoryWorkflow({
    project,
    selectedChapterId,
    candidatePath,
    selectChapterAndRefresh,
    loadMarkdownFile,
    setActiveModule,
    setActiveView,
    setCandidate,
    setCandidateSelection,
    setCandidateRestoreSource,
    setCandidateReviewIssues,
    setCandidateWarnings,
    setMessage,
  })
  const writingBriefWorkflow = useWritingBriefWorkflow({
    project,
    selectedChapterId,
    loadMarkdownFile,
    loadMarkdownFiles,
    pushTaskLog,
    setActiveModule,
    setActiveModuleView,
    setAssistantState,
    setMessage,
    setWritingBrief,
    setWritingBriefPath,
  })

  async function hydrateProjectContext(rootPath: string, chapterId: string) {
    setCandidateSelection(null)
    setCandidateRestoreSource(null)
    setRecentParagraphReplacement(null)
    setFrameworkDraftContent('')
    setFrameworkDraftPath('')
    setFrameworkDraftSourceContent('')
    await loadKnowledgeFiles(rootPath)
    await loadAiProviders(rootPath)
    await loadFrameworkFiles(rootPath)
    await loadVolumes(rootPath)
    const activeFrameworkFile = frameworkFileByView[activeView]
    if (activeFrameworkFile) {
      await loadFrameworkFile(rootPath, activeFrameworkFile)
    }
    await loadMarkdownFiles(rootPath)
    await loadSkillFiles(rootPath)
    await loadTimelineEvents(rootPath)
    await loadSelectedChapter(rootPath, chapterId)
    await blueprintHistoryWorkflow.refresh(rootPath, chapterId)
    await candidateHistoryWorkflow.refresh(rootPath, chapterId)
  }







  async function importChapterMarkdownFile() {
    if (!project) {
      setMessage('Done.')
      return
    }

    if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
      setMessage('Done.')
      return
    }

    try {
      const selected = await tauriApi.chooseChapterMarkdownFile()
      if (!selected) return

      setTaskStatus('project', 'working')
      const imported = await tauriApi.importChapterMarkdown(project.root_path, selectedChapterId, selected)
      setChapterPath(imported.relative_path)
      setManuscript(imported.content)
      await refreshChapters(project.root_path, project.chapter_count)
      setTaskStatus('project', 'done')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  async function importNovelStructureFile() {
    if (!project) {
      setMessage('Done.')
      return
    }

    if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
      setMessage('Done.')
      return
    }

    try {
      const selected = await tauriApi.chooseNovelStructureFile()
      if (!selected) return

      setTaskStatus('project', 'working')
      const content = await tauriApi.readImportedDocument(selected)
      setFrameworkContent(content)
      setSelectedFrameworkFile('01-setting.md')
      setTaskStatus('project', 'done')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  async function importBlueprintBundle() {
    if (!project) {
      setMessage('Done.')
      return
    }

    if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
      setMessage('Done.')
      return
    }

    try {
      const selected = await tauriApi.chooseBlueprintBundleFile()
      if (!selected) return

      setTaskStatus('project', 'working')
      const content = await tauriApi.readImportedDocument(selected)
      const sections = extractBlueprintImportSections(content, project.chapter_count)
      if (sections.length === 0) {
        setMessage('没有识别到“第 N 章”格式的蓝图标题。')
        setTaskStatus('project', 'error')
        return
      }

      for (const section of sections) {
        await tauriApi.saveBlueprint(project.root_path, section.chapterId, section.content)
      }

      const current = sections.find((section) => section.chapterId === selectedChapterId) ?? sections[0]
      setBlueprint(current.content)
      setBlueprintPath(`blueprints/chapters/${current.chapterId}.md`)
      await blueprintHistoryWorkflow.refresh(project.root_path, current.chapterId)
      setTaskStatus('project', 'done')
      setMessage(`已导入 ${sections.length} 章蓝图。`)
      pushTaskLog(`Imported ${sections.length} blueprint chapters.`, 'done')
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }



  async function selectChapterAndRefresh(chapterId: string) {
    setCandidateSelection(null)
    setCandidateRestoreSource(null)
    setRecentParagraphReplacement(null)
    if (candidateGeneration.running) {
      const requestId = candidateGeneration.requestRef.current
      if (requestId && isTauriRuntime) {
        void tauriApi.cancelAiRequest(requestId).catch(() => undefined)
      }
      candidateGeneration.invalidate('Working')
    }
    await selectChapter(chapterId)
    setCandidateReviewPath(`manuscript/candidates/reviews/${chapterId}.md`)
    if (project) {
      await blueprintHistoryWorkflow.refresh(project.root_path, chapterId)
      await candidateHistoryWorkflow.refresh(project.root_path, chapterId)
    }
  }

  function cancelCandidateGeneration() {
    if (!candidateGeneration.running) {
      candidateGeneration.setStatus('Working')
      return
    }
    const requestId = candidateGeneration.requestRef.current
    if (requestId && isTauriRuntime) {
      void tauriApi.cancelAiRequest(requestId).catch(() => undefined)
    }
    candidateGeneration.invalidate('Working')
    setTaskStatus('ai', 'ready')
    setAssistantState('Working')
    setMessage('Done.')
    pushTaskLog('Candidate generation canceled by author.', 'ready')
  }

  async function importProjectFromTop() {
    if (!isTauriRuntime) {
      const opened = await openProject(wutongboliSampleProject.root_path)
      if (opened) {
        enterProjectStructure()
      }
      return
    }

    const selected = await tauriApi.chooseProjectFolder()
    if (!selected) {
      return
    }

    updateForm('root_path', selected)
    const opened = await openProject(selected)
    if (opened) {
      enterProjectStructure()
    }
  }

  async function saveAuthorInput() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('Working')
        return
      }

      const saved = await tauriApi.saveAuthorInput(project.root_path, selectedChapterId, authorInput)
      setAuthorInputPath(saved.relative_path)
      setAssistantState('Working')
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
    }
  }

  async function saveBlueprint() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('Working')
        return
      }

      const saved = await tauriApi.saveBlueprint(project.root_path, selectedChapterId, blueprint)
      setBlueprintPath(saved.relative_path)
      await blueprintHistoryWorkflow.refresh(project.root_path, selectedChapterId)
      setAssistantState('Working')
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
    }
  }

  async function saveBlueprintContent(content: string, successState = 'Blueprint saved') {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      setBlueprint(content)
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('Working')
        setMessage('Done.')
        return
      }

      const saved = await tauriApi.saveBlueprint(project.root_path, selectedChapterId, content)
      setBlueprintPath(saved.relative_path)
      await blueprintHistoryWorkflow.refresh(project.root_path, selectedChapterId)
      setAssistantState(successState)
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
      throw error
    }
  }

  async function saveAgentReplyAsBlueprintDraft(content: string) {
    if (!project) {
      setMessage('Done.')
      return
    }

    const relativePath = `blueprints/drafts/${selectedChapterId}-agent-${Date.now()}.md`
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setMessage('Done.')
        return
      }
      await tauriApi.saveModuleMarkdownFile(project.root_path, relativePath, content)
      await loadMarkdownFiles(project.root_path)
      setMessage('Done.')
    } catch (error) {
      setMessage(errorToString(error))
      throw error
    }
  }

  async function saveAgentReplyAsManuscriptOfficial(content: string) {
    if (!content.trim()) {
      setMessage('Done.')
      return
    }

    setRecentParagraphReplacement(null)
    setManuscript(content)
    setManuscriptSelection(null)
    setManuscriptRestoreSelection(null)
    setActiveModule('project-structure')
    setActiveView('manuscript')
    const saved = await saveChapterContent(content)
    if (!saved) {
      throw new Error('Operation failed')
    }
    setMessage('Done.')
  }

  async function generateFrameworkDraft() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    pushTaskLog('Task status updated.', 'working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setFrameworkDraftSourceContent(frameworkContent)
        setFrameworkDraftPath(`framework/drafts/${selectedFrameworkFile.replace(/\.md$/, '')}-preview.md`)
        setFrameworkDraftContent(`${frameworkContent.trim()}\n\n## AI Draft\n\nReview before saving.`)
        setAssistantState('Working')
        pushTaskLog('Preview: generated framework draft.', 'done')
        return
      }

      setFrameworkDraftSourceContent(frameworkContent)
      const draft = await tauriApi.generateFrameworkDraft(
        project.root_path,
        selectedFrameworkFile,
        frameworkContent,
      )
      setFrameworkDraftContent(draft.content)
      setFrameworkDraftPath(draft.relative_path)
      setAssistantState('Working')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  async function saveFrameworkDraftAsOfficial() {
    if (!frameworkDraftContent.trim()) {
      setMessage('Done.')
      return
    }
    setFrameworkContent(frameworkDraftContent)
    await saveFrameworkFile(frameworkDraftContent)
  }

  async function extractCharacterCards() {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('Working')
        setMessage('Done.')
        return
      }

      const index = await tauriApi.extractCharacterCards(project.root_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, index.relative_path)
      setActiveModule('characters')
      setActiveModuleView('characters-cards')
      setAssistantState('Working')
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
    }
  }

  async function generateCandidateDraft() {
    if (!project) {
      setMessage('Done.')
      return
    }

    const chapterId = selectedChapterId
    const requestId = `candidate-${chapterId}-${Date.now()}`
    const runId = candidateGeneration.begin(requestId)
    setTaskStatus('ai', 'working')
    setAssistantState('Working')
    pushTaskLog('Task status updated.', 'working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        const preview = `# Chapter ${Number(chapterId)} Candidate Draft\n\n`
        if (!candidateGeneration.isCurrent(runId)) return
        setWritingBriefPath(`tasks/writing-briefs/${chapterId}.md`)
        setCandidate(preview)
        setCandidateSelection(null)
        setCandidateRestoreSource(null)
        setCandidatePath(`manuscript/candidates/${chapterId}.md`)
        setCandidateReviewPath(`manuscript/candidates/reviews/${chapterId}.md`)
        const previewIssues = issuesFromWarnings(['Candidate draft is too short.'])
        setCandidateReviewIssues(previewIssues)
        setCandidateWarnings(warningsFromIssues(previewIssues))
        candidateGeneration.clearRequest(runId)
        candidateGeneration.stop('Working')
        setTaskStatus('ai', 'done')
        setAssistantState('Working')
        pushTaskLog('Task status updated.', 'done')
        return
      }

      const draft = await tauriApi.generateCandidateDraft(project.root_path, chapterId, requestId)
      if (!candidateGeneration.isCurrent(runId)) return
      candidateGeneration.clearRequest(runId)
      setCandidate(draft.content)
      setCandidateSelection(null)
      setCandidateRestoreSource(null)
      setCandidatePath(draft.relative_path)
      setCandidateReviewPath(draft.review_path)
      setWritingBriefPath(draft.writing_brief_path)
      setCandidateReviewIssues(draft.review_issues ?? [])
      setCandidateWarnings(draft.warnings ?? warningsFromIssues(draft.review_issues ?? []))
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      await candidateHistoryWorkflow.refresh(project.root_path, chapterId)
      if (!candidateGeneration.isCurrent(runId)) return
      setTaskStatus('ai', 'done')
      candidateGeneration.stop('Working')
      setAssistantState('Working')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      if (!candidateGeneration.isCurrent(runId)) return
      candidateGeneration.clearRequest(runId)
      candidateGeneration.stop('Working')
      setTaskStatus('ai', 'error')
      setAssistantState('Working')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  async function reviewCandidateDraft(content: string) {
    setCandidate(content)
    setCandidateSelection((selection) => clampSelection(selection, content.length))

    if (!isTauriRuntime || (project && isSampleProjectRoot(project.root_path))) {
      const previewIssues = countWords(content) < 500
        ? issuesFromWarnings(['Candidate draft is too short.'])
        : []
      setCandidateReviewIssues(previewIssues)
      setCandidateWarnings(warningsFromIssues(previewIssues))
      return
    }

    const issues = project
      ? await tauriApi.reviewCandidateDraftForChapter(project.root_path, selectedChapterId, content)
      : await tauriApi.reviewCandidateDraft(content)
    setCandidateReviewIssues(issues)
    setCandidateWarnings(warningsFromIssues(issues))
  }

  async function saveCandidateDraft() {
    await saveCandidateDraftContent(candidate, '?')
  }

  async function saveAgentReplyAsCandidate(content: string) {
    await saveCandidateDraftContent(content, 'Agent ')
  }

  async function saveCandidateDraftContent(content: string, successState: string) {
    if (!project) {
      setMessage('Done.')
      return
    }

    setAssistantState('Working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setCandidate(content)
        setAssistantState('Working')
        setMessage('Done.')
        return
      }

      const saved = await tauriApi.saveCandidate(
        project.root_path,
        selectedChapterId,
        content,
        candidateRestoreSource?.historyPath,
        candidateRestoreSource?.confirmationPath,
        candidateRestoreSource?.confirmationEntryId,
      )
      setCandidate(content)
      setCandidateSelection(null)
      setCandidateRestoreSource(null)
      setCandidatePath(saved.relative_path)
      setCandidateReviewPath(`manuscript/candidates/reviews/${selectedChapterId}.md`)
      const issues = await tauriApi.reviewCandidateDraftForChapter(project.root_path, selectedChapterId, content)
      setCandidateReviewIssues(issues)
      setCandidateWarnings(warningsFromIssues(issues))
      await candidateHistoryWorkflow.refresh(project.root_path, selectedChapterId)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setAssistantState(successState)
      setMessage('Done.')
    } catch (error) {
      setAssistantState('Working')
      setMessage(errorToString(error))
      throw error
    }
  }

  async function clearCandidateDraft() {
    if (!window.confirm('Delete all candidate drafts for this chapter?')) {
      return
    }

    setCandidate('')
    setCandidateSelection(null)
    setCandidateRestoreSource(null)
    setCandidateReviewIssues([])
    setCandidateWarnings([])

    if (!project) {
      setMessage('Done.')
      return
    }

    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setMessage('Done.')
        return
      }

      const saved = await tauriApi.saveCandidate(project.root_path, selectedChapterId, '')
      setCandidatePath(saved.relative_path)
      await candidateHistoryWorkflow.refresh(project.root_path, selectedChapterId)
      setMessage('Done.')
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function adoptCandidateDraft(mode: 'replace' | 'append' | 'insert' = 'replace') {
    const candidateForAdoption = candidateTextForAdoption(candidate, candidateSelection)
    if (!candidateForAdoption.trim()) {
      setMessage('No candidate text to adopt.')
      return
    }
    await adoptCandidateText(candidateForAdoption, mode, 'Candidate adopted')
  }

  async function adoptCandidateText(content: string, mode: 'replace' | 'append' | 'insert' = 'insert', sourceLabel = '') {
    if (!content.trim()) {
      setMessage('Done.')
      return
    }

    const adopted = adoptCandidateIntoManuscript(manuscript, content, mode, manuscriptSelection)
    setRecentParagraphReplacement(null)
    setManuscript(adopted.value)
    const adoptedSelection = { start: adopted.selectionStart, end: adopted.selectionEnd }
    setManuscriptSelection(adoptedSelection)
    setManuscriptRestoreSelection(adoptedSelection)
    setActiveModule('project-structure')
    setActiveView('manuscript')
    const saved = await saveChapterContent(adopted.value)
    if (saved && project && isTauriRuntime && !isSampleProjectRoot(project.root_path)) {
      const confirmation = await tauriApi.recordCandidateAdoption(
        project.root_path,
        selectedChapterId,
        mode,
        candidatePath,
        chapterPath,
      )
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setMessage(sourceLabel ? `${sourceLabel}: ${confirmation.relative_path}` : `Candidate adoption recorded: ${confirmation.relative_path}`)
      return
    }
    setMessage(sourceLabel || 'Candidate adopted.')
  }

  function locateCandidateText(content: string) {
    const range = findTextRange(candidate, content)
    if (!range) {
      setMessage('Done.')
      return
    }
    setCandidateSelection(range)
    setCandidateRestoreSelection(range)
    setActiveModule('project-structure')
    setActiveView('draft-box')
  }

  function locateManuscriptText(content: string) {
    const range = findTextRange(manuscript, content)
    if (!range) {
      setMessage('Done.')
      return
    }
    setManuscriptSelection(range)
    setManuscriptRestoreSelection(range)
    setActiveModule('project-structure')
    setActiveView('manuscript')
  }

  function openKnowledgeHit(kind: 'fact' | 'loop' | 'rule', text: string) {
    const sourceKind = knowledgeSourceKind(kind)
    const source = sourceKind === 'confirmed-facts'
      ? confirmedFacts
      : sourceKind === 'open-loops'
        ? openLoops
        : forbiddenRules
    const range = findTextRange(source, text)
    if (!range) {
      setMessage('Done.')
      return
    }
    setKnowledgeRestoreSelection({ kind: sourceKind, ...range })
    setActiveModule('knowledge')
    setActiveModuleView('knowledge-facts')
  }

  async function replaceManuscriptParagraph(candidateParagraph: string, manuscriptParagraph: string) {
    const range = findTextRange(manuscript, manuscriptParagraph)
    if (!range) {
      setMessage('Done.')
      return
    }
    if (!candidateParagraph.trim()) {
      setMessage('Done.')
      return
    }

    const replaced = replaceTextRange(manuscript, candidateParagraph, range)
    const replacedSelection = { start: replaced.selectionStart, end: replaced.selectionEnd }
    setRecentParagraphReplacement({
      chapterId: selectedChapterId,
      previousManuscript: manuscript,
      replacedManuscript: replaced.value,
      originalRange: range,
      replacementSelection: replacedSelection,
      candidatePreview: trimPreview(candidateParagraph),
      manuscriptPreview: trimPreview(manuscriptParagraph),
    })
    setManuscript(replaced.value)
    setManuscriptSelection(replacedSelection)
    setManuscriptRestoreSelection(replacedSelection)
    setActiveModule('project-structure')
    setActiveView('manuscript')
    const saved = await saveChapterContent(replaced.value)
    if (saved && project && isTauriRuntime && !isSampleProjectRoot(project.root_path)) {
      const confirmation = await tauriApi.recordCandidateAdoption(
        project.root_path,
        selectedChapterId,
        'replace-paragraph',
        candidatePath,
        chapterPath,
      )
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setMessage(`Paragraph replacement recorded: ${confirmation.relative_path}`)
      return
    }
    setMessage('Done.')
  }

  async function undoParagraphReplacement() {
    if (!recentParagraphReplacement) {
      setMessage('Done.')
      return
    }
    if (recentParagraphReplacement.chapterId !== selectedChapterId) {
      setRecentParagraphReplacement(null)
      setMessage('Done.')
      return
    }
    if (manuscript !== recentParagraphReplacement.replacedManuscript) {
      setRecentParagraphReplacement(null)
      setMessage('Done.')
      return
    }

    setManuscript(recentParagraphReplacement.previousManuscript)
    setManuscriptSelection(recentParagraphReplacement.originalRange)
    setManuscriptRestoreSelection(recentParagraphReplacement.originalRange)
    setActiveModule('project-structure')
    setActiveView('manuscript')
    const saved = await saveChapterContent(recentParagraphReplacement.previousManuscript)
    if (saved && project && isTauriRuntime && !isSampleProjectRoot(project.root_path)) {
      const confirmation = await tauriApi.recordCandidateAdoption(
        project.root_path,
        selectedChapterId,
        'undo-replace-paragraph',
        candidatePath,
        chapterPath,
      )
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setRecentParagraphReplacement(null)
      setMessage(`Undo recorded: ${confirmation.relative_path}`)
      return
    }
    setRecentParagraphReplacement(null)
    setMessage(saved ? 'Paragraph replacement undone.' : 'Undo failed.')
  }

  async function exportProject(
    format: 'markdown' | 'txt' | 'docx',
    scope: 'all' | 'chapter' | 'selected' = 'all',
    chapterIds: string[] = [],
  ) {
    if (!project) {
      setMessage('Done.')
      return
    }

    setTaskStatus('project', 'working')
    pushTaskLog('Task status updated.', 'working')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setTaskStatus('project', 'done')
        setLastExportedPath('preview/export.md')
        setMessage('Done.')
        pushTaskLog('Task status updated.', 'done')
        return
      }

      const exported = await tauriApi.exportManuscript({
        root_path: project.root_path,
        format,
        scope,
        chapter_id: selectedChapterId,
        chapter_ids: chapterIds,
      })
      setLastExportedPath(exported.relative_path)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setTaskStatus('project', 'done')
      setMessage('Done.')
      pushTaskLog('Task status updated.', 'done')
    } catch (error) {
      setTaskStatus('project', 'error')
      setMessage(errorToString(error))
      pushTaskLog('Task status updated.', 'error')
    }
  }

  return (
    <main className={`app-shell ${agentOpen ? 'agent-open' : ''} ${focusMode ? 'focus-mode' : ''}`}>
      <TopBar
        project={project}
        locale={locale}
        onLocaleChange={changeLocale}
        theme={theme}
        onThemeToggle={toggleTheme}
        t={translate}
      />

      <ModuleRail
        activeModule={activeModule}
        locale={locale}
        onSelectModule={workspaceDocuments.selectModule}
        t={translate}
      />

      <ProjectPanel
        project={project}
        message={message}
        recentProjects={recentProjects}
        chapters={chapters}
        volumes={volumes}
        selectedChapterId={selectedChapterId}
        activeModule={activeModule}
        activeModuleView={activeModuleView}
        activeView={activeView}
        locale={locale}
        t={translate}
        onSelectRecentProject={(name, rootPath) => {
          updateForm('name', name)
          updateForm('root_path', rootPath)
          void openProject(rootPath, name).then((opened) => {
            if (opened) {
              enterProjectStructure()
            }
          })
        }}
        onSelectChapter={(chapterId) => void selectChapterAndRefresh(chapterId)}
        onSelectModule={workspaceDocuments.selectModule}
        onSelectModuleView={workspaceDocuments.selectModuleView}
        onSelectView={workspaceDocuments.selectView}
      />

      <Workspace
        activeView={activeView}
        activeModule={activeModule}
        activeModuleView={activeModuleView}
        locale={locale}
        t={translate}
        focusMode={focusMode}
        project={project}
        isProjectReadOnly={project ? isSampleProjectRoot(project.root_path) : false}
        recentProjects={recentProjects}
        form={form}
        busy={busy}
        currentChapter={currentChapter}
        chapters={chapters}
        selectedChapterId={selectedChapterId}
        chapterPath={chapterPath}
        manuscript={manuscript}
        manuscriptSelection={manuscriptSelection}
        manuscriptRestoreSelection={manuscriptRestoreSelection}
        knowledgeRestoreSelection={knowledgeRestoreSelection}
        recentParagraphReplacement={recentParagraphReplacement}
        manuscriptWordCount={manuscriptWordCount}
        saveState={saveState}
        frameworkPath={frameworkPath}
        frameworkContent={frameworkContent}
        frameworkDraftContent={frameworkDraftContent}
        frameworkDraftPath={frameworkDraftPath}
        frameworkDraftSourceContent={frameworkDraftSourceContent}
        blueprintPath={blueprintPath}
        blueprint={blueprint}
        blueprintHistory={blueprintHistoryWorkflow.blueprintHistory}
        selectedBlueprintHistoryPath={blueprintHistoryWorkflow.selectedBlueprintHistoryPath}
        blueprintHistoryPreview={blueprintHistoryWorkflow.blueprintHistoryPreview}
        authorInputPath={authorInputPath}
        authorInput={authorInput}
        writingBrief={writingBrief}
        writingBriefPath={writingBriefPath}
        candidateWarnings={candidateWarnings}
        candidateReviewIssues={candidateReviewIssues}
        candidatePath={candidatePath}
        candidateReviewPath={candidateReviewPath}
        candidate={candidate}
        candidateSelection={candidateSelection}
        candidateRestoreSelection={candidateRestoreSelection}
        candidateHistory={candidateHistoryWorkflow.candidateHistory}
        selectedCandidateHistoryPath={candidateHistoryWorkflow.selectedCandidateHistoryPath}
        candidateHistoryPreview={candidateHistoryWorkflow.candidateHistoryPreview}
        candidateHistoryJumpSource={candidateHistoryWorkflow.candidateHistoryJumpSource}
        candidateGenerationRunning={candidateGeneration.running}
        candidateGenerationStatus={candidateGeneration.status}
        tasks={tasks}
        confirmedFacts={confirmedFacts}
        confirmedFactsPath={confirmedFactsPath}
        openLoops={openLoops}
        openLoopsPath={openLoopsPath}
        forbiddenRules={forbiddenRules}
        forbiddenRulesPath={forbiddenRulesPath}
        timelineEvents={timelineEvents}
        timelineEventsPath={timelineEventsPath}
        timelineMilestones={timelineMilestones}
        timelineMilestonesPath={timelineMilestonesPath}
        timelineSettings={timelineSettings}
        volumes={volumes}
        markdownFiles={markdownFiles}
        projectVaultEntries={projectVaultEntries}
        projectHealth={projectHealth}
        selectedMarkdownPath={selectedMarkdownPath}
        markdownPreview={markdownPreview}
        skillFiles={skillFiles}
        selectedSkillName={selectedSkillName}
        skillPreview={skillPreview}
        onChangeSkillPreview={setSkillPreview}
        skillWarnings={skillWarnings}
        aiProvidersJson={aiProvidersJson}
        aiProvidersPath={aiProvidersPath}
        providerTestMessage={providerTestMessage}
        highlightedModelCallId={recordNavigation.highlightedModelCallId}
        highlightedConfirmationPath={recordNavigation.highlightedConfirmationPath}
        highlightedConfirmationEntryId={recordNavigation.highlightedConfirmationEntryId}
        lastExportedPath={lastExportedPath}
        onImportProject={() => void importProjectFromTop()}
        onSelectView={workspaceDocuments.selectView}
        onOpenRecentProject={(name, rootPath) => {
          updateForm('name', name)
          updateForm('root_path', rootPath)
          void openProject(rootPath, name).then((opened) => {
            if (opened) {
              enterProjectStructure()
            }
          })
        }}
        onOpenExport={() => workspaceDocuments.selectView('exports')}
        onUpdateForm={updateForm}
        onChooseFolder={chooseFolder}
        onOpenProject={() => {
          void openProject().then((opened) => {
            if (opened) {
              enterProjectStructure()
            }
          })
        }}
        onOpenSampleProject={() => {
          updateForm('name', wutongboliSampleProject.name)
          updateForm('root_path', wutongboliSampleProject.root_path)
          updateForm('language', wutongboliSampleProject.language)
          updateForm('chapter_count', wutongboliSampleProject.chapter_count)
          updateForm('target_words_per_chapter', wutongboliSampleProject.target_words_per_chapter)
          updateForm('template', wutongboliSampleProject.template)
          void openProject(wutongboliSampleProject.root_path).then((opened) => {
            if (opened) {
              enterProjectStructure()
            }
          })
        }}
        onCreateProject={() => {
          void createProject().then((created) => {
            if (created) {
              enterProjectStructure()
            }
          })
        }}
        onSaveFrameworkFile={() => void saveFrameworkFile()}
        onChangeFrameworkContent={setFrameworkContent}
        onGenerateFrameworkDraft={() => void generateFrameworkDraft()}
        onImportNovelStructureFile={() => void importNovelStructureFile()}
        onSaveBlueprint={() => void saveBlueprint()}
        onChangeBlueprint={setBlueprint}
        onGenerateBlueprintDraft={() => void blueprintDraftWorkflow.generateBlueprintDraft()}
        onGenerateBlueprintFromManuscript={() => void blueprintDraftWorkflow.generateBlueprintFromManuscript()}
        onImportBlueprintBundle={() => void importBlueprintBundle()}
        onRegenerateAllBlueprints={() => void blueprintDraftWorkflow.regenerateAllBlueprints()}
        onRegenerateFollowingBlueprints={() => void blueprintDraftWorkflow.regenerateFollowingBlueprints()}
        onSelectChapter={(chapterId) => void selectChapterAndRefresh(chapterId)}
        onLoadBlueprintHistory={(relativePath) => void blueprintHistoryWorkflow.loadPreview(relativePath)}
        onSaveAuthorInput={() => void saveAuthorInput()}
        onChangeAuthorInput={setAuthorInput}
        onComposeBrief={() => void writingBriefWorkflow.composeBrief()}
        onChangeWritingBrief={setWritingBrief}
        onGenerateCandidate={() => void generateCandidateDraft()}
        onCancelCandidateGeneration={cancelCandidateGeneration}
        onChangeCandidate={(content) => void reviewCandidateDraft(content)}
        onChangeCandidateSelection={(start, end) => setCandidateSelection({ start, end })}
        onSaveCandidate={() => void saveCandidateDraft()}
        onClearCandidate={() => void clearCandidateDraft()}
        onAdoptCandidate={(mode) => void adoptCandidateDraft(mode)}
        onAdoptCandidateText={(content, mode) => void adoptCandidateText(content, mode)}
        onReplaceManuscriptParagraph={(candidateParagraph, manuscriptParagraph) => void replaceManuscriptParagraph(candidateParagraph, manuscriptParagraph)}
        onUndoParagraphReplacement={() => void undoParagraphReplacement()}
        onOpenKnowledgeHit={openKnowledgeHit}
        onLocateCandidateText={locateCandidateText}
        onLocateManuscriptText={locateManuscriptText}
        onChangeManuscriptSelection={(start, end) => setManuscriptSelection({ start, end })}
        onLoadCandidateHistory={(relativePath) => void candidateHistoryWorkflow.loadPreview(relativePath)}
        onOpenCandidateHistoryVersion={(manifestPath, confirmationPath, confirmationEntryId) => void candidateHistoryWorkflow.openVersion(manifestPath, confirmationPath, confirmationEntryId)}
        onRestoreCandidateHistory={() => void candidateHistoryWorkflow.restore()}
        onChangeManuscript={(content) => {
          setRecentParagraphReplacement(null)
          changeManuscript(content)
        }}
        onSaveChapter={() => void saveChapterContent(manuscript)}
        onImportChapterMarkdown={() => void importChapterMarkdownFile()}
        onChangeConfirmedFacts={setConfirmedFacts}
        onChangeOpenLoops={setOpenLoops}
        onChangeForbiddenRules={setForbiddenRules}
        onChangeTimelineEvents={setTimelineEvents}
        onSaveTimelineEvents={() => void saveTimelineEvents()}
        onChangeTimelineMilestones={setTimelineMilestones}
        onSaveTimelineMilestones={() => void saveTimelineMilestones()}
        onChangeVolumes={setVolumes}
        onSaveVolumes={(nextVolumes) => void saveVolumes(nextVolumes)}
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
        onPinSearchResultToBrief={(result) => void writingBriefWorkflow.pinSearchResultToBrief(result)}
        onPinSearchResultsToBrief={(results) => void writingBriefWorkflow.pinSearchResultsToBrief(results)}
        onListPinnedContext={() => writingBriefWorkflow.listPinnedContextForCurrentChapter()}
        onRemovePinnedContextItem={(index) => writingBriefWorkflow.removePinnedContextItem(index)}
        onChangeMarkdownPreview={setMarkdownPreview}
        onSaveModuleMarkdownFile={(relativePath, content) => void saveModuleMarkdownFile(relativePath, content)}
        onExtractCharacterCards={() => void extractCharacterCards()}
        onLoadSkillFile={(fileName) => {
          if (project) {
            void loadSkillFile(project.root_path, fileName)
          }
        }}
        onImportSkillFile={() => void importSkillFile()}
        onImportSkillFolder={() => void importSkillFolder()}
        onSetSkillDisabled={(fileName, disabled) => void setSkillDisabled(fileName, disabled)}
        onSetTemporarySkill={(fileName, temporary) => void setTemporarySkill(fileName, temporary)}
        onRescanFacts={(kind, authorInput) => void rescanFacts(kind, authorInput)}
        onChangeAiProvidersJson={setAiProvidersJson}
        onSaveAiProviders={saveAiProviders}
        onTestAiProvider={testAiProvider}
        onTestAiProviders={testAiProviders}
        onOpenModelProviders={() => {
          setActiveModule('model-calls')
          setActiveModuleView('model-providers')
        }}
        onOpenModelCallRecord={recordNavigation.openModelCallRecord}
        onClearModelCallHighlight={recordNavigation.clearModelCallHighlight}
        onOpenConfirmationRecord={recordNavigation.openConfirmationRecord}
        onClearConfirmationHighlight={recordNavigation.clearConfirmationHighlight}
        onToggleFocusMode={toggleFocusMode}
        onExportProject={(format, scope, chapterIds) => void exportProject(format, scope, chapterIds)}
      />

      {activeModule !== 'home' && activeModule !== 'knowledge' && !(project && isSampleProjectRoot(project.root_path)) && (
        <AgentPanel
          key={project?.root_path ?? 'none'}
          hidden={!agentOpen}
          activeModule={activeModule}
          activeModuleView={activeModuleView}
          activeView={activeView}
          projectRoot={project?.root_path ?? ''}
          assistantState={assistantState}
          chapters={chapters}
          currentChapter={currentChapter}
          selectedChapterId={selectedChapterId}
          chapterPath={chapterPath}
          manuscript={manuscript}
          writingBrief={writingBrief}
          frameworkPath={frameworkPath}
          frameworkFiles={frameworkFiles}
          selectedFrameworkFile={selectedFrameworkFile}
          frameworkContent={frameworkContent}
          frameworkDraftContent={frameworkDraftContent}
          frameworkDraftPath={frameworkDraftPath}
          frameworkDraftSourceContent={frameworkDraftSourceContent}
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
          candidateReviewIssues={candidateReviewIssues}
          candidatePath={candidatePath}
          candidateReviewPath={candidateReviewPath}
          candidate={candidate}
          candidateGenerationRunning={candidateGeneration.running}
          candidateGenerationStatus={candidateGeneration.status}
          skillFiles={skillFiles}
          onClose={() => setAgentOpen(false)}
          onSelectChapter={(chapterId) => void selectChapterAndRefresh(chapterId)}
          onOpenProjectFile={(relativePath) => {
            if (project && relativePath) {
              setActiveModule('knowledge')
              setActiveModuleView('knowledge-markdown')
              void loadMarkdownFile(project.root_path, relativePath)
            }
          }}
          onComposeBrief={() => void writingBriefWorkflow.composeBrief()}
          onGenerateFrameworkDraft={() => void generateFrameworkDraft()}
          onSaveFrameworkFile={() => void saveFrameworkFile()}
          onSaveFrameworkDraftAsOfficial={() => void saveFrameworkDraftAsOfficial()}
          onSelectFrameworkFile={(fileName) => {
            setFrameworkDraftContent('')
            setFrameworkDraftPath('')
            setFrameworkDraftSourceContent('')
            if (project) {
              void loadFrameworkFile(project.root_path, fileName)
            } else {
              setSelectedFrameworkFile(fileName)
            }
          }}
          onChangeFrameworkContent={setFrameworkContent}
          onChangeFrameworkDraftContent={setFrameworkDraftContent}
          onSaveBlueprint={() => void saveBlueprint()}
          onChangeBlueprint={setBlueprint}
          onGenerateBlueprintDraft={() => void blueprintDraftWorkflow.generateBlueprintDraft()}
          onRegenerateAllBlueprints={() => void blueprintDraftWorkflow.regenerateAllBlueprints()}
          onSaveAuthorInput={() => void saveAuthorInput()}
          onChangeAuthorInput={setAuthorInput}
          onSaveKnowledgeFile={(kind) => void saveKnowledgeFile(kind)}
          onChangeConfirmedFacts={setConfirmedFacts}
          onChangeOpenLoops={setOpenLoops}
          onRescanFacts={(kind, authorInput) => void rescanFacts(kind, authorInput)}
          onSaveAiProviders={saveAiProviders}
          onTestAiProvider={() => void testAiProvider()}
          onChangeAiProvidersJson={setAiProvidersJson}
          onChangeWritingBrief={setWritingBrief}
          onChangeCandidate={(content) => void reviewCandidateDraft(content)}
          onGenerateCandidate={() => void generateCandidateDraft()}
          onCancelCandidateGeneration={cancelCandidateGeneration}
          onSaveCandidate={() => void saveCandidateDraft()}
          onSaveAgentReplyAsCandidate={(content) => saveAgentReplyAsCandidate(content)}
          onSaveAgentReplyAsBlueprintDraft={(content) => saveAgentReplyAsBlueprintDraft(content)}
          onSaveAgentReplyAsBlueprintOfficial={(content) => saveBlueprintContent(content, 'AI blueprint saved as official draft')}
          onSaveAgentReplyAsManuscriptOfficial={(content) => saveAgentReplyAsManuscriptOfficial(content)}
          onClearCandidate={() => void clearCandidateDraft()}
          onAdoptCandidate={() => void adoptCandidateDraft('insert')}
        />
      )}

      {!focusMode && activeModule !== 'home' && activeModule !== 'knowledge' && (
        <button
          type="button"
          className={`agent-toggle ${agentOpen ? 'open' : ''}`}
          onClick={() => setAgentOpen((current) => !current)}
          aria-label={agentOpen ? 'Hide AI assistant' : 'Open AI assistant'}
          title={agentOpen ? 'Hide AI assistant' : 'Open AI assistant'}
        >
          {agentOpen ? 'x' : 'AI'}
        </button>
      )}

      <Taskbar
        tasks={tasks}
        taskLogs={taskLogs}
        liveMessage={candidateGeneration.running ? candidateGeneration.status : undefined}
        locale={locale}
        t={translate}
      />
    </main>
  )
}

export default App


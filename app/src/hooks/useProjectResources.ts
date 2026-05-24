import { useState } from 'react'
import * as tauriApi from '../api/tauriApi'
import { isTauriRuntime, wutongboliSampleProject } from '../constants'
import { wutongboliFrameworkFiles } from '../sample/wutongboliFramework'
import type {
  FrameworkFileSummary,
  MarkdownFileSummary,
  ProjectHealthReport,
  ProjectSummary,
  ProjectVaultEntry,
  ProviderBatchTestResult,
  ProviderTestResult,
  SkillFileSummary,
  TimelineSettings,
  VolumeInfo,
} from '../types'
import { errorToString, isSampleProjectRoot } from '../utils'

type KnowledgeFileKind = tauriApi.KnowledgeFileKind

type UseProjectResourcesInput = {
  project: ProjectSummary | null
  setMessage: (message: string) => void
  setAssistantState: (state: string) => void
}

function emitTaskLog(message: string, status: 'ready' | 'working' | 'done' | 'error' = 'working') {
  window.dispatchEvent(new CustomEvent('olienta:task-log', { detail: { message, status } }))
}

function hasUsableProviderConfig(content: string) {
  const parsed = JSON.parse(content)
  if (!Array.isArray(parsed)) return false
  return parsed.some((item) => {
    if (!item || typeof item !== 'object') return false
    const provider = item as Record<string, unknown>
    const hasSecret =
      (typeof provider.apiKey === 'string' && provider.apiKey.trim().length > 0) ||
      (typeof provider.apiKeyEncrypted === 'string' && provider.apiKeyEncrypted.trim().length > 0)
    const hasModel = typeof provider.model === 'string' && provider.model.trim().length > 0
    const hasBaseUrl = typeof provider.baseUrl === 'string' && provider.baseUrl.trim().length > 0
    return provider.enabled !== false && hasSecret && hasModel && hasBaseUrl
  })
}

export function useProjectResources({
  project,
  setMessage,
  setAssistantState,
}: UseProjectResourcesInput) {
  const [confirmedFacts, setConfirmedFacts] = useState('# 已确认事实\n\n')
  const [confirmedFactsPath, setConfirmedFactsPath] = useState('facts/confirmed-facts.md')
  const [openLoops, setOpenLoops] = useState('# 未闭合伏笔\n\n')
  const [openLoopsPath, setOpenLoopsPath] = useState('facts/open-loops.md')
  const [forbiddenRules, setForbiddenRules] = useState('# 禁止违背\n\n')
  const [forbiddenRulesPath, setForbiddenRulesPath] = useState('facts/forbidden-rules.md')
  const [aiProvidersJson, setAiProvidersJson] = useState('[]\n')
  const [aiProvidersPath, setAiProvidersPath] = useState('软件设置/ai-providers.json')
  const [providerTestMessage, setProviderTestMessage] = useState('尚未测试')
  const [timelineEvents, setTimelineEvents] = useState('# 时间线事件\n\n')
  const [timelineEventsPath, setTimelineEventsPath] = useState('timeline/events.md')
  const [timelineMilestones, setTimelineMilestones] = useState('# 里程碑\n\n')
  const [timelineMilestonesPath, setTimelineMilestonesPath] = useState('timeline/milestones.md')
  const [timelineSettings, setTimelineSettings] = useState<TimelineSettings>({
    enabled: false,
    conflictCheck: false,
    storage: 'local-folder',
  })
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [frameworkFiles, setFrameworkFiles] = useState<FrameworkFileSummary[]>([])
  const [markdownFiles, setMarkdownFiles] = useState<MarkdownFileSummary[]>([])
  const [projectVaultEntries, setProjectVaultEntries] = useState<ProjectVaultEntry[]>([])
  const [projectHealth, setProjectHealth] = useState<ProjectHealthReport | null>(null)
  const [selectedMarkdownPath, setSelectedMarkdownPath] = useState('')
  const [markdownPreview, setMarkdownPreview] = useState('项目打开后，可以在这里查看项目内所有 Markdown 文件。')
  const [skillFiles, setSkillFiles] = useState<SkillFileSummary[]>([])
  const [selectedSkillName, setSelectedSkillName] = useState('')
  const [skillPreview, setSkillPreview] = useState('导入 Skill 后，可以在这里查看已选择的写作方法。')
  const [skillWarnings, setSkillWarnings] = useState<string[]>([])
  const [selectedFrameworkFile, setSelectedFrameworkFile] = useState('01-setting.md')
  const [frameworkContent, setFrameworkContent] = useState('# 框架设定\n\n')
  const [frameworkPath, setFrameworkPath] = useState('framework/01-setting.md')

  async function loadKnowledgeFiles(rootPath: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setConfirmedFacts('# 已确认事实\n\n浏览器预览只展示界面，不会读取或写入本地项目。请打开桌面版使用真实资料库。')
      setOpenLoops('# 未闭合伏笔\n\n- 浏览器预览只展示界面，不会读取或写入本地项目。请打开桌面版使用真实资料库。')
      setForbiddenRules('# 禁止违背\n\n- 浏览器预览只展示界面，不会读取或写入本地项目。请打开桌面版使用真实资料库。')
      return
    }

    const [facts, loops, forbidden] = await Promise.all([
      tauriApi.loadKnowledgeFile(rootPath, 'confirmed-facts'),
      tauriApi.loadKnowledgeFile(rootPath, 'open-loops'),
      tauriApi.loadKnowledgeFile(rootPath, 'forbidden-rules'),
    ])
    setConfirmedFactsPath(facts.relative_path)
    setConfirmedFacts(facts.content)
    setOpenLoopsPath(loops.relative_path)
    setOpenLoops(loops.content)
    setForbiddenRulesPath(forbidden.relative_path)
    setForbiddenRules(forbidden.content)
  }

  async function saveKnowledgeFile(kind: KnowledgeFileKind) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存记忆文件')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已保存')
        return
      }

      const content =
        kind === 'open-loops'
          ? openLoops
          : kind === 'forbidden-rules'
            ? forbiddenRules
            : confirmedFacts
      const saved = await tauriApi.saveKnowledgeFile(project.root_path, kind, content)
      if (kind === 'open-loops') {
        setOpenLoopsPath(saved.relative_path)
      } else if (kind === 'forbidden-rules') {
        setForbiddenRulesPath(saved.relative_path)
      } else {
        setConfirmedFactsPath(saved.relative_path)
      }
      setAssistantState('记忆文件已保存')
      setMessage(`${saved.relative_path} 已保存，会进入后续本章写作要求。`)
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  async function loadAiProviders(rootPath: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setAiProvidersJson('[]\n')
      setAiProvidersPath('软件设置/ai-providers.json')
      setProviderTestMessage(
        isSampleProjectRoot(rootPath)
          ? '示例项目不读取本机 AI Provider；请打开自己的本地项目后配置。'
          : '浏览器预览不读取本机 AI Provider。',
      )
      return
    }

    const loaded = await tauriApi.loadAiProviders(rootPath)
    setAiProvidersPath(loaded.relative_path)
    setAiProvidersJson(loaded.content)
  }

  async function saveAiProviders() {
    setAssistantState('正在保存 AI 配置')
    emitTaskLog('开始保存软件级 AI Provider 配置。')
    try {
      if (!hasUsableProviderConfig(aiProvidersJson)) {
        setProviderTestMessage('未配置可用 Provider：请至少填写启用的 Base URL、API Key 和模型。')
        setAssistantState('Provider 配置不完整')
        setMessage('未配置可用 Provider，已阻止保存为可用 AI 配置。')
        emitTaskLog('AI Provider 配置不完整：未保存。', 'error')
        return false
      }

      if (!isTauriRuntime) {
        JSON.parse(aiProvidersJson)
        setProviderTestMessage('浏览器预览不能保存 API。请使用桌面版 Olienta 保存软件级配置。')
        setAssistantState('预览不能保存 API')
        setMessage('浏览器预览不能保存 API。请打开桌面版 Olienta 后再保存。')
        emitTaskLog('浏览器预览不能保存 API 配置。', 'error')
        return false
      }

      const saved = await tauriApi.saveAiProviders(project?.root_path ?? '', aiProvidersJson)
      setAiProvidersPath(saved.relative_path)
      setAiProvidersJson(saved.content)
      if (project) {
        await loadMarkdownFiles(project.root_path)
        await loadMarkdownFile(project.root_path, 'logs/model-calls/history.md')
      }
      setAssistantState('AI 配置已保存')
      setProviderTestMessage(`已保存到软件设置 · ${saved.relative_path}`)
      setMessage('AI Provider 配置已保存为软件级设置，所有项目共用。')
      emitTaskLog(`AI Provider 配置已保存：${saved.relative_path}`, 'done')
      return true
    } catch (error) {
      setProviderTestMessage(`保存失败 · ${errorToString(error)}`)
      setAssistantState('保存失败')
      setMessage(errorToString(error))
      emitTaskLog(`AI Provider 保存失败：${errorToString(error)}`, 'error')
      return false
    }
  }

  async function testAiProvider(): Promise<ProviderTestResult | null | void> {
    setAssistantState('正在测试 Provider')
    setProviderTestMessage('测试中...')
    emitTaskLog('开始测试当前默认 Provider。')
    try {
      if (!isTauriRuntime) {
        JSON.parse(aiProvidersJson)
        setProviderTestMessage('浏览器预览：JSON 有效，桌面端会发起真实连接测试。')
        setAssistantState('预览测试完成')
        emitTaskLog('浏览器预览：Provider JSON 有效。', 'done')
        return
      }

      const saved = await saveAiProviders()
      if (!saved) {
        return
      }

      const result = await tauriApi.testAiProvider(project?.root_path ?? '')
      setProviderTestMessage(
        `${result.ok ? '可用' : '不可用'} · ${result.provider} · ${result.message}`,
      )
      if (project) {
        await loadMarkdownFiles(project.root_path)
        await loadMarkdownFile(project.root_path, 'logs/model-calls/history.md')
      }
      setAssistantState(result.ok ? 'Provider 可用' : 'Provider 不可用')
      emitTaskLog(`${result.ok ? 'Provider 测试通过' : 'Provider 测试失败'}：${result.provider}`, result.ok ? 'done' : 'error')
      return result
    } catch (error) {
      setProviderTestMessage(errorToString(error))
      setAssistantState('测试失败')
      emitTaskLog(`Provider 测试失败：${errorToString(error)}`, 'error')
      return null
    }
  }

  async function testAiProviders(): Promise<ProviderBatchTestResult | null | void> {
    setAssistantState('正在批量测试 Provider')
    setProviderTestMessage('批量测试中...')
    emitTaskLog('开始批量测试所有 Provider。')
    try {
      if (!isTauriRuntime) {
        JSON.parse(aiProvidersJson)
        setProviderTestMessage('浏览器预览：Provider JSON 有效，桌面端会执行批量连接测试。')
        setAssistantState('预览测试完成')
        emitTaskLog('浏览器预览：Provider JSON 有效。', 'done')
        return
      }

      const saved = await saveAiProviders()
      if (!saved) {
        return
      }

      const result = await tauriApi.testAiProviders(project?.root_path ?? '')
      setProviderTestMessage(`批量测试：${result.passed}/${result.total} 可用，${result.failed} 失败`)
      if (project) {
        await loadMarkdownFiles(project.root_path)
        await loadMarkdownFile(project.root_path, 'logs/model-calls/history.md')
      }
      setAssistantState(result.failed === 0 ? 'Provider 批量测试通过' : 'Provider 批量测试有失败')
      emitTaskLog(`Provider 批量测试完成：${result.passed}/${result.total} 可用，${result.failed} 失败。`, result.failed === 0 ? 'done' : 'error')
      return result
    } catch (error) {
      setProviderTestMessage(errorToString(error))
      setAssistantState('批量测试失败')
      emitTaskLog(`Provider 批量测试失败：${errorToString(error)}`, 'error')
      return null
    }
  }

  async function loadFrameworkFiles(rootPath: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      const names = isWutongboliPreview(rootPath)
        ? Object.keys(wutongboliFrameworkFiles)
        : ['01-setting.md']
      setFrameworkFiles(names.map((name) => ({
        id: name.replace(/\.md$/, ''),
        name,
        relative_path: `framework/${name}`,
      })))
      return
    }

    const files = await tauriApi.listFrameworkFiles(rootPath)
    setFrameworkFiles(files)
    if (files[0]) {
      await loadFrameworkFile(rootPath, files[0].name)
    }
  }

  async function loadMarkdownFiles(rootPath: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      if (isWutongboliPreview(rootPath)) {
        const files = Object.entries(wutongboliFrameworkFiles).map(([name, content]) => ({
          category: '故事构架',
          relative_path: `framework/${name}`,
          bytes: content.length,
        }))
        setMarkdownFiles(files)
        setProjectVaultEntries(files.map((file) => ({
          ...file,
          extension: 'md',
          readable: true,
        })))
        setProjectHealth(makePreviewProjectHealth(true))
        if (files[0]) {
          await loadMarkdownFile(rootPath, files[0].relative_path)
        }
        return
      }

      const files = [
        { category: '故事构架', relative_path: 'framework/02-premise.md', bytes: 0 },
        { category: '正文', relative_path: 'manuscript/chapters/001.md', bytes: 0 },
      ]
      setMarkdownFiles(files)
      setProjectVaultEntries(files.map((file) => ({
        ...file,
        extension: 'md',
        readable: true,
      })))
      setProjectHealth(makePreviewProjectHealth(false))
      return
    }

    const [files, vaultEntries, health] = await Promise.all([
      tauriApi.listProjectMarkdownFiles(rootPath),
      tauriApi.listProjectVaultEntries(rootPath),
      tauriApi.inspectProjectHealth(rootPath),
    ])
    setMarkdownFiles(files)
    setProjectVaultEntries(vaultEntries)
    setProjectHealth(health)
    if (files[0]) {
      await loadMarkdownFile(rootPath, files[0].relative_path)
    }
  }

  async function repairProjectStructure() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在补齐项目结构')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setProjectHealth(makePreviewProjectHealth(true))
        setAssistantState('预览已补齐')
        setMessage('浏览器预览已模拟补齐；桌面端会真实写入缺失文件。')
        return
      }

      const health = await tauriApi.repairProjectStructure(project.root_path)
      setProjectHealth(health)
      await loadMarkdownFiles(project.root_path)
      await loadFrameworkFiles(project.root_path)
      await loadSkillFiles(project.root_path)
      setAssistantState('项目结构已补齐')
      setMessage('已补齐缺失项目结构；已有作者内容没有被覆盖。')
    } catch (error) {
      setAssistantState('补齐失败')
      setMessage(errorToString(error))
    }
  }

  async function revealProjectFolder() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setMessage(`浏览器预览不能打开系统文件夹。桌面端会打开：${project.root_path}`)
        return
      }

      await tauriApi.revealProjectFolder(project.root_path)
      setMessage(`已请求系统打开作品文件夹：${project.root_path}`)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function revealProjectPath(relativePath: string) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    try {
      if (!isTauriRuntime) {
        setMessage(`浏览器预览不能定位系统文件。桌面端会定位：${relativePath}`)
        return
      }

      await tauriApi.revealProjectPath(project.root_path, relativePath)
      setMessage(`已请求系统定位项目文件：${relativePath}`)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function importReferenceFile() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在导入资料')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已导入')
        setMessage('浏览器预览已模拟导入；桌面端会复制到 knowledge/markdown/imported。')
        return
      }

      const selected = await tauriApi.chooseReferenceFile()
      if (!selected) {
        setAssistantState('已取消导入')
        return
      }

      const imported = await tauriApi.importReferenceFile(project.root_path, selected)
      setSelectedMarkdownPath(imported.relative_path)
      setMarkdownPreview(imported.content)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, imported.relative_path)
      setAssistantState('资料已导入')
      setMessage(`${imported.relative_path} 已导入到作品资料夹，可用于本地检索和本章写作要求钉选。`)
    } catch (error) {
      setAssistantState('导入失败')
      setMessage(errorToString(error))
    }
  }

  async function importReferenceFolder() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在批量导入资料')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已导入')
        setMessage('浏览器预览已模拟批量导入；桌面端会复制 Markdown/TXT 到 knowledge/markdown/imported。')
        return
      }

      const selected = await tauriApi.chooseReferenceFolder()
      if (!selected) {
        setAssistantState('已取消导入')
        return
      }

      const result = await tauriApi.importReferenceDirectory(project.root_path, selected)
      await loadMarkdownFiles(project.root_path)
      const lastFile = result.imported_files[result.imported_files.length - 1]
      if (lastFile) {
        await loadMarkdownFile(project.root_path, lastFile.relative_path)
      }
      setAssistantState('资料文件夹已导入')
      setMessage(
        `已导入 ${result.imported_count} 个资料文件，跳过 ${result.skipped_count} 个非支持文件。`,
      )
    } catch (error) {
      setAssistantState('导入失败')
      setMessage(errorToString(error))
    }
  }

  async function loadSkillFiles(rootPath: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setSkillFiles([
        {
          name: 'preview-skill.md',
          relative_path: 'skills/selected/preview-skill.md',
          bytes: 0,
          disabled: false,
          temporary: false,
          category: 'general',
          conflict_tags: [],
          scope: 'general',
        },
      ])
      setSkillWarnings(['预览模式：桌面端会显示真实 Skill 冲突提示。'])
      return
    }

    const files = await tauriApi.listSelectedSkills(rootPath)
    setSkillFiles(files)
    setSkillWarnings(await tauriApi.analyzeSkillConflicts(rootPath))
    if (files[0]) {
      await loadSkillFile(rootPath, files[0].name)
    }
  }

  async function loadSkillFile(rootPath: string, fileName: string) {
    setSelectedSkillName(fileName)

    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setSkillPreview(`# ${fileName}\n\n浏览器预览模式。`)
      return
    }

    const loaded = await tauriApi.loadSkillFile(rootPath, fileName)
    setSkillPreview(loaded.content)
  }

  async function importSkillFile() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在导入 Skill')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已导入')
        return
      }

      const selected = await tauriApi.chooseSkillFile()
      if (!selected) {
        setAssistantState('已取消导入')
        return
      }

      const imported = await tauriApi.importSkillFile(project.root_path, selected)
      await loadSkillFiles(project.root_path)
      await loadSkillFile(project.root_path, imported.name)
      await loadMarkdownFiles(project.root_path)
      setSelectedSkillName(imported.name)
      setMessage(`${imported.relative_path} 已导入并选择，会进入后续本章写作要求。`)
      setAssistantState('Skill 已导入')
    } catch (error) {
      setAssistantState('导入失败')
      setMessage(errorToString(error))
    }
  }

  async function importSkillFolder() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在导入 Skill 文件夹')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已导入')
        return
      }

      const selected = await tauriApi.chooseSkillFolder()
      if (!selected) {
        setAssistantState('已取消导入')
        return
      }

      const imported = await tauriApi.importSkillFile(project.root_path, selected)
      await loadSkillFiles(project.root_path)
      await loadSkillFile(project.root_path, imported.name)
      await loadMarkdownFiles(project.root_path)
      setSelectedSkillName(imported.name)
      setMessage(`${imported.relative_path} 已导入并选择，会进入后续本章写作要求。`)
      setAssistantState('Skill 文件夹已导入')
    } catch (error) {
      setAssistantState('导入失败')
      setMessage(errorToString(error))
    }
  }

  async function setSkillDisabled(fileName: string, disabled: boolean) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setSkillFiles((files) =>
          files.map((file) => (file.name === fileName ? { ...file, disabled } : file)),
        )
        return
      }

      const files = await tauriApi.setSkillDisabled(project.root_path, fileName, disabled)
      setSkillFiles(files)
      setSkillWarnings(await tauriApi.analyzeSkillConflicts(project.root_path))
      setMessage(disabled ? `${fileName} 已停用，不会进入 AI 上下文。` : `${fileName} 已重新启用。`)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function setTemporarySkill(fileName: string, temporary: boolean) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setSkillFiles((files) =>
          files.map((file) => (file.name === fileName ? { ...file, temporary } : file)),
        )
        return
      }

      const files = await tauriApi.setTemporarySkill(project.root_path, fileName, temporary)
      setSkillFiles(files)
      setSkillWarnings(await tauriApi.analyzeSkillConflicts(project.root_path))
      setMessage(temporary ? `${fileName} 已加入临时启用。` : `${fileName} 已移出临时启用。`)
    } catch (error) {
      setMessage(errorToString(error))
    }
  }

  async function loadMarkdownFile(rootPath: string, relativePath: string) {
    setSelectedMarkdownPath(relativePath)

    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      if (isWutongboliPreview(rootPath)) {
        const fileName = relativePath.replace(/^framework\//, '')
        setMarkdownPreview(
          wutongboliFrameworkFiles[fileName] ?? `# ${relativePath}\n\n测试项目里没有找到这个 Markdown 文件。`,
        )
        return
      }

      setMarkdownPreview(`# ${relativePath}\n\n浏览器预览模式。`)
      return
    }

    const loaded = await tauriApi.loadProjectMarkdownFile(rootPath, relativePath)
    setMarkdownPreview(loaded.content)
  }

  async function saveModuleMarkdownFile(relativePath: string, content: string) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存模块文档')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setMarkdownPreview(content)
        setAssistantState('预览已保存')
        return
      }

      const saved = await tauriApi.saveModuleMarkdownFile(project.root_path, relativePath, content)
      setSelectedMarkdownPath(saved.relative_path)
      setMarkdownPreview(saved.content)
      setAssistantState('模块文档已保存')
      setMessage(`${saved.relative_path} 已保存。`)
      await loadMarkdownFiles(project.root_path)
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  async function rescanFacts(kind: 'confirmed-facts' | 'open-loops' | 'forbidden-rules' = 'confirmed-facts', authorInput = '') {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在再次生成记忆文件')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已再次生成')
        return
      }

      const saved = await tauriApi.regenerateKnowledgeFile(project.root_path, kind, authorInput)
      if (kind === 'confirmed-facts') {
        setConfirmedFactsPath(saved.relative_path)
        setConfirmedFacts(saved.content)
      } else if (kind === 'open-loops') {
        setOpenLoopsPath(saved.relative_path)
        setOpenLoops(saved.content)
      } else {
        setForbiddenRulesPath(saved.relative_path)
        setForbiddenRules(saved.content)
      }
      setAssistantState('记忆文件已再次生成')
      setMessage(`${saved.relative_path} 已再次生成。`)
      await loadMarkdownFiles(project.root_path)
    } catch (error) {
      setAssistantState('再次生成失败')
      setMessage(errorToString(error))
    }
  }

  async function loadTimelineEvents(rootPath: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setTimelineEvents('# 时间线事件\n\n- 浏览器预览模式。')
      return
    }

    const [loaded, milestones, settings] = await Promise.all([
      tauriApi.loadTimelineEvents(rootPath),
      tauriApi.loadTimelineMilestones(rootPath),
      tauriApi.loadTimelineSettings(rootPath),
    ])
    setTimelineEventsPath(loaded.relative_path)
    setTimelineEvents(loaded.content)
    setTimelineMilestonesPath(milestones.relative_path)
    setTimelineMilestones(milestones.content)
    setTimelineSettings(settings)
  }

  async function loadVolumes(rootPath: string) {
    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setVolumes(defaultVolumes(project?.chapter_count ?? wutongboliSampleProject.chapter_count))
      return
    }

    const loaded = await tauriApi.loadVolumes(rootPath)
    setVolumes(loaded)
  }

  async function saveVolumes(nextVolumes?: VolumeInfo[]) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }
    const targetVolumes = nextVolumes ?? volumes
    setAssistantState('正在保存分卷')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setVolumes(targetVolumes)
        setAssistantState('示例项目不会写入分卷')
        setMessage('示例项目不会写入本地文件；请创建或打开自己的作品项目后再保存分卷。')
        return
      }
      const saved = await tauriApi.saveVolumes(project.root_path, targetVolumes)
      setVolumes(saved)
      setAssistantState('分卷已保存')
      setMessage('分卷已保存到 .olienta/volumes.json。')
      emitTaskLog('分卷配置已保存：.olienta/volumes.json', 'done')
    } catch (error) {
      setAssistantState('分卷保存失败')
      setMessage(errorToString(error))
      emitTaskLog(`分卷配置保存失败：${errorToString(error)}`, 'error')
    }
  }

  async function saveTimelineEvents() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存时间线')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已保存')
        return
      }

      const saved = await tauriApi.saveTimelineEvents(project.root_path, timelineEvents)
      setTimelineEventsPath(saved.relative_path)
      setTimelineEvents(saved.content)
      setAssistantState('时间线已保存')
      setMessage(`${saved.relative_path} 已保存，会进入后续 AI 任务上下文。`)
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  async function saveTimelineMilestones() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存里程碑')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已保存')
        return
      }

      const saved = await tauriApi.saveTimelineMilestones(project.root_path, timelineMilestones)
      setTimelineMilestonesPath(saved.relative_path)
      setTimelineMilestones(saved.content)
      setAssistantState('里程碑已保存')
      setMessage(`${saved.relative_path} 已保存，会进入 Timeline Pro 检查上下文。`)
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  async function loadFrameworkFile(rootPath: string, fileName: string) {
    setSelectedFrameworkFile(fileName)

    if (!isTauriRuntime || isSampleProjectRoot(rootPath)) {
      setFrameworkPath(`framework/${fileName}`)
      setFrameworkContent(
        isWutongboliPreview(rootPath)
          ? wutongboliFrameworkFiles[fileName] ?? `# ${fileName}\n\n测试项目里没有找到这个框架文件。`
          : `# ${fileName}\n\n浏览器预览模式。`,
      )
      return
    }

    const loaded = await tauriApi.loadFrameworkFile(rootPath, fileName)
    setFrameworkPath(loaded.relative_path)
    setFrameworkContent(loaded.content)
  }

  async function saveFrameworkFile(contentOverride?: string) {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存框架文件')
    try {
      if (!isTauriRuntime || isSampleProjectRoot(project.root_path)) {
        setAssistantState('预览已保存')
        return
      }

      const saved = await tauriApi.saveFrameworkFile(
        project.root_path,
        selectedFrameworkFile,
        contentOverride ?? frameworkContent,
      )
      setFrameworkPath(saved.relative_path)
      setFrameworkContent(saved.content)
      setAssistantState('框架文件已保存')
      setMessage(`${saved.relative_path} 已保存，会进入后续本章写作要求。`)
      await loadMarkdownFiles(project.root_path)
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  return {
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
    frameworkFiles,
    markdownFiles,
    projectVaultEntries,
    projectHealth,
    selectedMarkdownPath,
    markdownPreview,
    setMarkdownPreview,
    skillFiles,
    selectedSkillName,
    skillPreview,
    setSkillPreview,
    skillWarnings,
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
    repairProjectStructure,
    revealProjectFolder,
    revealProjectPath,
    importReferenceFile,
    importReferenceFolder,
    loadMarkdownFile,
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
    loadVolumes,
    saveVolumes,
    saveTimelineEvents,
    saveTimelineMilestones,
  }
}

function isWutongboliPreview(rootPath: string) {
  return normalizePath(rootPath) === normalizePath(wutongboliSampleProject.root_path)
}

function normalizePath(path: string) {
  return path.replace(/\\/g, '/').toLowerCase()
}

function defaultVolumes(chapterCount: number): VolumeInfo[] {
  return [
    {
      id: 'volume-1',
      title: '第一卷',
      startChapter: 1,
      endChapter: Math.max(1, chapterCount),
      summary: '',
    },
  ]
}

function makePreviewProjectHealth(sample: boolean): ProjectHealthReport {
  return {
    status: sample ? 'ready' : 'warning',
    ready: sample,
    missing_count: sample ? 0 : 1,
    warning_count: sample ? 0 : 1,
    checks: [
      {
        kind: 'required-directory',
        label: '外部作品文件夹',
        relative_path: sample ? 'sample://wutongboli' : '未打开项目',
        status: sample ? 'ok' : 'missing',
        message: sample ? '预览测试项目结构完整。' : '桌面端打开项目后会读取真实健康检查。',
      },
    ],
  }
}

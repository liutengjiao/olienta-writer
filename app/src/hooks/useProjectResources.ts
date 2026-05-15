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
  SkillFileSummary,
  TimelineSettings,
} from '../types'
import { errorToString } from '../utils'

type KnowledgeFileKind = tauriApi.KnowledgeFileKind

type UseProjectResourcesInput = {
  project: ProjectSummary | null
  setMessage: (message: string) => void
  setAssistantState: (state: string) => void
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
  const [aiProvidersPath, setAiProvidersPath] = useState('.olienta/ai-providers.json')
  const [providerTestMessage, setProviderTestMessage] = useState('尚未测试')
  const [timelineEvents, setTimelineEvents] = useState('# 时间线事件\n\n')
  const [timelineEventsPath, setTimelineEventsPath] = useState('timeline/events.md')
  const [timelineSettings, setTimelineSettings] = useState<TimelineSettings>({
    enabled: false,
    conflictCheck: false,
    storage: 'local-folder',
  })
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
    if (!isTauriRuntime) {
      setConfirmedFacts('# 已确认事实\n\n浏览器预览模式。')
      setOpenLoops('# 未闭合伏笔\n\n- 浏览器预览模式。')
      setForbiddenRules('# 禁止违背\n\n- 浏览器预览模式。')
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
      if (!isTauriRuntime) {
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
      setMessage(`${saved.relative_path} 已保存，会进入后续任务书。`)
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
    }
  }

  async function loadAiProviders(rootPath: string) {
    if (!isTauriRuntime) {
      setAiProvidersJson('[]\n')
      return
    }

    const loaded = await tauriApi.loadAiProviders(rootPath)
    setAiProvidersPath(loaded.relative_path)
    setAiProvidersJson(loaded.content)
  }

  async function saveAiProviders() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return false
    }

    setAssistantState('正在保存 AI 配置')
    try {
      if (!isTauriRuntime) {
        JSON.parse(aiProvidersJson)
        setAssistantState('预览已保存')
        return true
      }

      const saved = await tauriApi.saveAiProviders(project.root_path, aiProvidersJson)
      setAiProvidersPath(saved.relative_path)
      setAiProvidersJson(saved.content)
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setAssistantState('AI 配置已保存')
      setMessage('AI Provider 配置已保存。')
      return true
    } catch (error) {
      setAssistantState('保存失败')
      setMessage(errorToString(error))
      return false
    }
  }

  async function testAiProvider() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在测试 Provider')
    setProviderTestMessage('测试中...')
    try {
      if (!isTauriRuntime) {
        JSON.parse(aiProvidersJson)
        setProviderTestMessage('浏览器预览：JSON 有效，桌面端会发起真实连接测试。')
        setAssistantState('预览测试完成')
        return
      }

      const saved = await saveAiProviders()
      if (!saved) {
        return
      }

      const result = await tauriApi.testAiProvider(project.root_path)
      setProviderTestMessage(
        `${result.ok ? '可用' : '不可用'} · ${result.provider} · ${result.message}`,
      )
      await loadMarkdownFiles(project.root_path)
      await loadMarkdownFile(project.root_path, 'tasks/history.jsonl')
      setAssistantState(result.ok ? 'Provider 可用' : 'Provider 不可用')
    } catch (error) {
      setProviderTestMessage(errorToString(error))
      setAssistantState('测试失败')
    }
  }

  async function loadFrameworkFiles(rootPath: string) {
    if (!isTauriRuntime) {
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
    if (!isTauriRuntime) {
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
      if (!isTauriRuntime) {
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
      if (!isTauriRuntime) {
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
      if (!isTauriRuntime) {
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
      setMessage(`${imported.relative_path} 已导入到作品资料夹，可用于本地检索和任务书钉选。`)
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
      if (!isTauriRuntime) {
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
    if (!isTauriRuntime) {
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

    if (!isTauriRuntime) {
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
      if (!isTauriRuntime) {
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
      await loadMarkdownFiles(project.root_path)
      setSelectedSkillName(imported.name)
      setMessage(`${imported.relative_path} 已导入并选择，会进入后续写作任务书。`)
      setAssistantState('Skill 已导入')
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
      if (!isTauriRuntime) {
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
      if (!isTauriRuntime) {
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

    if (!isTauriRuntime) {
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
      if (!isTauriRuntime) {
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

  async function rescanFacts() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在重扫事实')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览已重扫')
        return
      }

      const saved = await tauriApi.rescanFacts(project.root_path)
      setConfirmedFactsPath(saved.relative_path)
      setConfirmedFacts(saved.content)
      setAssistantState('事实库已重扫')
      setMessage('已从已保存正文重建事实库。')
      await loadMarkdownFiles(project.root_path)
    } catch (error) {
      setAssistantState('重扫失败')
      setMessage(errorToString(error))
    }
  }

  async function loadTimelineEvents(rootPath: string) {
    if (!isTauriRuntime) {
      setTimelineEvents('# 时间线事件\n\n- 浏览器预览模式。')
      return
    }

    const [loaded, settings] = await Promise.all([
      tauriApi.loadTimelineEvents(rootPath),
      tauriApi.loadTimelineSettings(rootPath),
    ])
    setTimelineEventsPath(loaded.relative_path)
    setTimelineEvents(loaded.content)
    setTimelineSettings(settings)
  }

  async function saveTimelineEvents() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存时间线')
    try {
      if (!isTauriRuntime) {
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

  async function loadFrameworkFile(rootPath: string, fileName: string) {
    setSelectedFrameworkFile(fileName)

    if (!isTauriRuntime) {
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

  async function saveFrameworkFile() {
    if (!project) {
      setMessage('请先创建或打开项目。')
      return
    }

    setAssistantState('正在保存框架文件')
    try {
      if (!isTauriRuntime) {
        setAssistantState('预览已保存')
        return
      }

      const saved = await tauriApi.saveFrameworkFile(
        project.root_path,
        selectedFrameworkFile,
        frameworkContent,
      )
      setFrameworkPath(saved.relative_path)
      setFrameworkContent(saved.content)
      setAssistantState('框架文件已保存')
      setMessage(`${saved.relative_path} 已保存，会进入后续任务书。`)
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
    timelineSettings,
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
    setSkillDisabled,
    setTemporarySkill,
    rescanFacts,
    loadFrameworkFile,
    saveFrameworkFile,
    loadTimelineEvents,
    saveTimelineEvents,
  }
}

function isWutongboliPreview(rootPath: string) {
  return normalizePath(rootPath) === normalizePath(wutongboliSampleProject.root_path)
}

function normalizePath(path: string) {
  return path.replace(/\\/g, '/').toLowerCase()
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
        relative_path: sample ? 'D:/windsurf/olienta-projects/wutongboli-sample-project' : '未打开项目',
        status: sample ? 'ok' : 'missing',
        message: sample ? '预览测试项目结构完整。' : '桌面端打开项目后会读取真实健康检查。',
      },
    ],
  }
}

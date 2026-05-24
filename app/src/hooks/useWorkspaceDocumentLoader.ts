import { defaultProjectForm } from '../constants'
import {
  defaultMarkdownByModuleView,
  defaultModuleView,
  previewByFrameworkFile,
  frameworkFileByView,
} from '../lib/appWorkflowConfig'
import type { ModuleKey, ModuleSubViewKey, ProjectSummary, ViewKey } from '../types'

type UseWorkspaceDocumentLoaderInput = {
  project: ProjectSummary | null
  loadFrameworkFile: (rootPath: string, fileName: string) => Promise<void>
  loadMarkdownFile: (rootPath: string, relativePath: string) => Promise<void>
  setActiveModule: (module: ModuleKey) => void
  setActiveModuleView: (view: ModuleSubViewKey) => void
  setActiveView: (view: ViewKey) => void
  setFrameworkContent: (content: string) => void
  setMessage: (message: string) => void
  setSelectedFrameworkFile: (fileName: string) => void
  updateProjectForm: (field: 'name' | 'root_path', value: string) => void
}

export function useWorkspaceDocumentLoader({
  project,
  loadFrameworkFile,
  loadMarkdownFile,
  setActiveModule,
  setActiveModuleView,
  setActiveView,
  setFrameworkContent,
  setMessage,
  setSelectedFrameworkFile,
  updateProjectForm,
}: UseWorkspaceDocumentLoaderInput) {
  function selectView(view: ViewKey) {
    setActiveModule('project-structure')
    setActiveView(view)
    if (!project) {
      setMessage('Done.')
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
    if (module === 'project-structure') {
      setActiveView('novel-settings')
    }
    loadDefaultModuleDocument(view)
  }

  function selectModuleView(view: ModuleSubViewKey) {
    setActiveModuleView(view)
    if (view === 'home-entry') {
      updateProjectForm('name', '')
      updateProjectForm('root_path', defaultProjectForm.root_path)
    }
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

  return {
    selectView,
    selectModule,
    selectModuleView,
    loadDefaultModuleDocument,
  }
}

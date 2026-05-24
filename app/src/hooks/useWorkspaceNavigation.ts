import { useEffect, useState } from 'react'
import type { ModuleKey, ModuleSubViewKey, ViewKey } from '../types'

export function useWorkspaceNavigation() {
  const [activeModule, setActiveModule] = useState<ModuleKey>('home')
  const [activeModuleView, setActiveModuleView] = useState<ModuleSubViewKey>('home-recent')
  const [activeView, setActiveView] = useState<ViewKey>('continue-writing')
  const [focusMode, setFocusMode] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)

  useEffect(() => {
    const openAgent = () => setAgentOpen(true)
    window.addEventListener('olienta:open-agent', openAgent)
    return () => window.removeEventListener('olienta:open-agent', openAgent)
  }, [])

  function enterProjectStructure() {
    setActiveModule('project-structure')
    setActiveModuleView('home-entry')
    setActiveView('novel-settings')
  }

  return {
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
  }
}

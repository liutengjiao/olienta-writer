import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'olienta.theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    document.body.classList.toggle('dark-theme', theme === 'dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggleTheme }
}

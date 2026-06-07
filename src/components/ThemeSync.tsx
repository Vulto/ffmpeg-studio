import { useEffect } from 'react'
import { useThemeStore } from '../store/themeStore'

export function ThemeSync() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return null
}
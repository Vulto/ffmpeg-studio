import { Moon, Settings, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useThemeStore } from '../store/themeStore'

export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      {open && (
        <div
          role="menu"
          aria-label="Settings"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-44 -translate-x-1/2 rounded-xl border border-border-l1 bg-surface-inset p-2 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 px-1 py-0.5">
            <span className="text-xs text-fg-secondary">Theme</span>
            <button
              type="button"
              role="menuitem"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={toggleTheme}
              className="flex size-8 items-center justify-center rounded-lg text-fg-primary transition-colors hover:bg-button-ghost-hover"
            >
              {theme === 'dark' ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={[
          'flex size-9 items-center justify-center rounded-xl transition-colors',
          open
            ? 'bg-button-ghost-active text-fg-primary'
            : 'text-fg-primary hover:bg-button-ghost-hover',
        ].join(' ')}
      >
        <Settings className="size-[18px]" />
      </button>
    </div>
  )
}
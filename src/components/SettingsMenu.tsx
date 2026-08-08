import { Moon, PanelRight, Settings, Sun, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MAX_UPLOAD_LABEL } from '../lib/media'
import { usePanelStore } from '../store/mediaStore'
import { useThemeStore } from '../store/themeStore'

type SettingsMenuProps = {
  onImport: () => void
}

export function SettingsMenu({ onImport }: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const { terminalOpen, toggleTerminal } = usePanelStore()

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
          className="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-xl border border-border-l1 bg-surface-inset p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            title={`Import media (max ${MAX_UPLOAD_LABEL})`}
            aria-label={`Import media, maximum ${MAX_UPLOAD_LABEL} per file`}
            onClick={() => {
              onImport()
              setOpen(false)
            }}
            className="flex w-full flex-col items-stretch gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-button-ghost-hover"
          >
            <span className="flex items-center gap-2.5 text-xs text-fg-primary">
              <Upload className="size-4 shrink-0 text-fg-secondary" />
              Import media
            </span>
            <span className="pl-[26px] text-[10px] text-fg-secondary">
              Max {MAX_UPLOAD_LABEL} per file
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            title={terminalOpen ? 'Hide terminal' : 'Show terminal'}
            aria-label={terminalOpen ? 'Hide terminal' : 'Show terminal'}
            aria-pressed={terminalOpen}
            onClick={() => {
              toggleTerminal()
              setOpen(false)
            }}
            className={[
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-button-ghost-hover',
              terminalOpen ? 'bg-button-ghost-active text-fg-primary' : 'text-fg-primary',
            ].join(' ')}
          >
            <PanelRight className="size-4 shrink-0 text-fg-secondary" />
            {terminalOpen ? 'Hide terminal' : 'Show terminal'}
          </button>

          <div className="my-1 h-px bg-border-l1" />

          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
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
          'flex size-9 items-center justify-center rounded-xl border border-border-l1 shadow-lg backdrop-blur-sm transition-colors',
          open
            ? 'bg-button-ghost-active text-fg-primary'
            : 'bg-surface-l1/90 text-fg-primary hover:bg-button-ghost-hover',
        ].join(' ')}
      >
        <Settings className="size-[18px]" />
      </button>
    </div>
  )
}

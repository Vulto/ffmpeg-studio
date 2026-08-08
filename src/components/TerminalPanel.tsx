import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import { Loader2, PanelRightClose, Play, Terminal, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { useRunJob } from '../hooks/useRunJob'
import { terminalThemes } from '../lib/terminalThemes'
import { usePanelStore } from '../store/mediaStore'
import { useThemeStore } from '../store/themeStore'
import { useTerminalStore } from '../store/terminalStore'
import { ReferenceChips } from './ReferenceChips'

const WELCOME = [
  'FFmpeg Studio terminal',
  'Click canvas nodes to insert {{0}}, {{1}}, ... into the command.',
  'Example: ffprobe -hide_banner {{0}}',
  'Example: ffmpeg -i {{0}} -vf "scale=640:-1" -y outputs/preview.mp4',
  'Successful outputs are added to the canvas automatically.',
  '',
].join('\r\n')

export function TerminalPanel() {
  const { terminalOpen, setTerminalOpen } = usePanelStore()
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const {
    status,
    command,
    ffmpegVersion,
    focusInputRequest,
    setCommand,
    setCommandSelection,
    setLogger,
    navigateHistory,
  } = useTerminalStore()
  const { runCommand } = useRunJob()
  const theme = useThemeStore((s) => s.theme)

  const loggerRef = useRef({
    writeln: (text: string) => xtermRef.current?.writeln(text),
    write: (text: string) => xtermRef.current?.write(text),
  })

  useEffect(() => {
    if (!terminalOpen || !terminalRef.current) return

    const term = new XTerm({
      theme: terminalThemes[useThemeStore.getState().theme],
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      convertEol: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(terminalRef.current)
    fit.fit()
    term.writeln(WELCOME)

    xtermRef.current = term
    fitRef.current = fit
    setLogger(loggerRef.current)

    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => fit.fit(), 100)
    })
    observer.observe(terminalRef.current)

    return () => {
      clearTimeout(resizeTimer)
      observer.disconnect()
      setLogger(null)
      term.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [terminalOpen, setLogger])

  useEffect(() => {
    const term = xtermRef.current
    if (!term) return
    term.options.theme = terminalThemes[theme]
  }, [theme])

  // Print current health once when the panel opens (health is polled app-wide).
  useEffect(() => {
    if (!terminalOpen) return
    // Defer until xterm mount effect has run.
    const timer = setTimeout(() => {
      if (!xtermRef.current) return
      const {
        serverOnline: online,
        ffmpegAvailable: ffmpegOk,
        ffmpegVersion: version,
      } = useTerminalStore.getState()
      if (!online) {
        loggerRef.current.writeln(
          '\x1b[31m●\x1b[0m API server offline — run `bun run dev`',
        )
        return
      }
      if (version) {
        loggerRef.current.writeln(`\x1b[32m●\x1b[0m ${version}`)
      } else if (!ffmpegOk) {
        loggerRef.current.writeln('\x1b[31m●\x1b[0m ffmpeg unavailable')
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [terminalOpen])

  useEffect(() => {
    if (focusInputRequest === 0) return
    inputRef.current?.focus()
  }, [focusInputRequest])

  const handleClear = useCallback(() => {
    xtermRef.current?.clear()
    xtermRef.current?.writeln(WELCOME)
    if (ffmpegVersion) {
      loggerRef.current.writeln(`\x1b[32m●\x1b[0m ${ffmpegVersion}`)
    }
  }, [ffmpegVersion])

  if (!terminalOpen) return null

  return (
    <aside
      className="flex h-full w-[var(--panel-width)] shrink-0 flex-col border-l border-border-l1 bg-surface-inset"
      aria-label="Terminal panel"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-l1 px-4">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-fg-secondary" />
          <span className="text-sm font-medium text-fg-primary">Terminal</span>
          {status === 'running' && (
            <Loader2 className="size-3.5 animate-spin text-fg-secondary" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl p-1.5 text-fg-secondary transition-colors hover:bg-button-ghost-hover hover:text-fg-primary"
            aria-label="Clear terminal"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setTerminalOpen(false)}
            className="rounded-xl p-1.5 text-fg-secondary transition-colors hover:bg-button-ghost-hover hover:text-fg-primary"
            aria-label="Collapse terminal panel"
          >
            <PanelRightClose className="size-4" />
          </button>
        </div>
      </header>

      <div ref={terminalRef} className="min-h-0 flex-1 px-2 py-2" />

      <ReferenceChips />

      <form
        className="shrink-0 border-t border-border-l1 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void runCommand()
        }}
      >
        <div className="flex items-center gap-2 rounded-xl border border-border-l1 bg-surface-base px-3 py-2">
          <span className="font-mono text-xs text-fg-secondary">$</span>
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onSelect={(e) => {
              const target = e.target as HTMLInputElement
              setCommandSelection({
                start: target.selectionStart ?? 0,
                end: target.selectionEnd ?? 0,
              })
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCommand(navigateHistory('up', command))
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCommand(navigateHistory('down', command))
              }
            }}
            placeholder="ffmpeg -i {{0}} ..."
            disabled={status === 'running'}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg-primary outline-none placeholder:text-fg-secondary/60"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={status === 'running' || !command.trim()}
            className="rounded-lg p-1.5 text-fg-primary transition-colors hover:bg-button-ghost-hover disabled:opacity-40"
            aria-label="Run command"
          >
            <Play className="size-3.5" />
          </button>
        </div>
      </form>
    </aside>
  )
}
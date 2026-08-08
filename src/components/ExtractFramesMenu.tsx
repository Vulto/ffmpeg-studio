import { useEffect, useId, useRef, useState } from 'react'
import type { PresetOptions } from '../lib/api'

export const EXTRACT_FPS_MAX = 60
export const EXTRACT_FPS_CHIPS = [1, 5, 15, 30] as const

type ExtractFramesMenuProps = {
  open: boolean
  disabled?: boolean
  /** Prefer 'up' when the control sits near the bottom of the viewport. */
  placement?: 'up' | 'down'
  onClose: () => void
  onRun: (options: PresetOptions) => void
}

export function ExtractFramesMenu({
  open,
  disabled,
  placement = 'up',
  onClose,
  onRun,
}: ExtractFramesMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const [fpsText, setFpsText] = useState('1')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const parseFps = (): number | null => {
    const value = Number(fpsText)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a number greater than 0')
      return null
    }
    if (value > EXTRACT_FPS_MAX) {
      setError(`Max ${EXTRACT_FPS_MAX} fps`)
      return null
    }
    setError(null)
    return value
  }

  const runMode = (options: PresetOptions) => {
    onRun(options)
    onClose()
  }

  const placementClass =
    placement === 'up'
      ? 'bottom-full left-0 mb-1'
      : 'top-full left-0 mt-1'

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Extract frames options"
      className={[
        'absolute z-50 w-60 rounded-xl border border-border-l1 bg-surface-inset p-2 shadow-lg',
        placementClass,
      ].join(' ')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-1.5 px-0.5 text-[10px] uppercase tracking-wide text-fg-secondary">
        Extract mode
      </p>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={disabled}
          title="Write every decoded frame (ignores sample rate)"
          onClick={() => runMode({ mode: 'all' })}
          className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-border-l1 bg-surface-l1 px-2.5 py-2 text-left transition-colors hover:bg-button-ghost-hover disabled:opacity-40"
        >
          <span className="text-xs font-medium text-fg-primary">All frames</span>
          <span className="text-[10px] text-fg-secondary">
            Every frame — not limited by fps below
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          title="Drop near-duplicate frames with mpdecimate"
          onClick={() => runMode({ mode: 'unique' })}
          className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-border-l1 bg-surface-l1 px-2.5 py-2 text-left transition-colors hover:bg-button-ghost-hover disabled:opacity-40"
        >
          <span className="text-xs font-medium text-fg-primary">Unique frames</span>
          <span className="text-[10px] text-fg-secondary">
            Skip near-duplicates only
          </span>
        </button>
      </div>

      <div className="my-2 h-px bg-border-l1" />

      <p className="mb-1 px-0.5 text-[10px] uppercase tracking-wide text-fg-secondary">
        Sample rate
      </p>
      <p className="mb-1.5 px-0.5 text-[10px] leading-snug text-fg-secondary">
        Only used by “Extract at N fps” — not for All or Unique.
      </p>

      <div className="flex items-center gap-1.5">
        <input
          id={inputId}
          type="number"
          min={0.1}
          max={EXTRACT_FPS_MAX}
          step="any"
          value={fpsText}
          disabled={disabled}
          onChange={(e) => {
            setFpsText(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const fps = parseFps()
              if (fps === null) return
              runMode({ mode: 'fps', fps })
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-border-l1 bg-surface-base px-2 py-1.5 font-mono text-xs text-fg-primary outline-none focus:border-fg-secondary disabled:opacity-40"
        />
        <span className="shrink-0 text-xs text-fg-secondary">fps</span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {EXTRACT_FPS_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            onClick={() => {
              setFpsText(String(chip))
              setError(null)
            }}
            className={[
              'rounded-md border px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-40',
              fpsText === String(chip)
                ? 'border-fg-secondary bg-button-ghost-active text-fg-primary'
                : 'border-border-l1 bg-surface-l1 text-fg-secondary hover:bg-button-ghost-hover hover:text-fg-primary',
            ].join(' ')}
          >
            {chip}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-1.5 px-0.5 text-[10px] text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const fps = parseFps()
          if (fps === null) return
          runMode({ mode: 'fps', fps })
        }}
        className="mt-2 flex w-full items-center justify-center rounded-lg bg-fg-primary px-2.5 py-1.5 text-xs font-medium text-surface-base transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Extract at {fpsText || '?'} fps
      </button>
    </div>
  )
}

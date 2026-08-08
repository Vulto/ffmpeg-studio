import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Film, Maximize2, SlidersHorizontal } from 'lucide-react'
import {
  PRESETS,
  canRunPreset,
  getPresetInputPaths,
} from '../lib/presets'
import type { PresetId } from '../lib/presets'
import type { PresetOptions } from '../lib/api'
import { useRunJob } from '../hooks/useRunJob'
import { useMediaStore } from '../store/mediaStore'
import { ExtractFramesMenu } from './ExtractFramesMenu'

const HIDE_DELAY_MS = 5000

type SelectionMode = 'none' | 'image' | 'video' | 'mixed'

const PRESET_MEDIA: Record<PresetId, 'image' | 'video'> = {
  upscale: 'image',
  slideshow: 'image',
  'extract-frames': 'video',
}

const PRESET_ICONS = {
  upscale: Maximize2,
  slideshow: SlidersHorizontal,
  'extract-frames': Film,
} as const

function getSelectionMode(
  selected: { data: { kind: 'image' | 'video' } }[],
): SelectionMode {
  if (selected.length === 0) return 'none'

  const kinds = new Set(selected.map((n) => n.data.kind))
  if (kinds.size > 1) return 'mixed'
  return kinds.has('video') ? 'video' : 'image'
}

export function BottomToolbar() {
  const nodes = useMediaStore((s) => s.nodes)
  const { runPresetJob, status } = useRunJob()
  const [visible, setVisible] = useState(true)
  const [extractOpen, setExtractOpen] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveringRef = useRef(false)

  const selected = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const mode = useMemo(() => getSelectionMode(selected), [selected])
  const hasContent = mode === 'image' || mode === 'video'

  const visiblePresets = useMemo(() => {
    if (mode !== 'image' && mode !== 'video') return []
    return PRESETS.filter((preset) => PRESET_MEDIA[preset.id] === mode)
  }, [mode])

  const selectionLabel =
    selected.length === 1
      ? selected[0]!.data.fileName
      : selected.length > 1
        ? `${selected.length} selected`
        : ''

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    if (hoveringRef.current || extractOpen) return
    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
    }, HIDE_DELAY_MS)
  }, [clearHideTimer, extractOpen])

  const reveal = useCallback(() => {
    if (!hasContent) {
      setVisible(false)
      clearHideTimer()
      return
    }
    setVisible(true)
    scheduleHide()
  }, [hasContent, clearHideTimer, scheduleHide])

  useEffect(() => {
    if (!hasContent) {
      setVisible(false)
      setExtractOpen(false)
      clearHideTimer()
      return
    }

    setVisible(true)
    scheduleHide()

    const onActivity = () => {
      reveal()
    }

    window.addEventListener('mousemove', onActivity, { passive: true })
    window.addEventListener('mousedown', onActivity)
    window.addEventListener('keydown', onActivity)
    window.addEventListener('wheel', onActivity, { passive: true })
    window.addEventListener('touchstart', onActivity, { passive: true })

    return () => {
      clearHideTimer()
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('mousedown', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('wheel', onActivity)
      window.removeEventListener('touchstart', onActivity)
    }
  }, [hasContent, reveal, scheduleHide, clearHideTimer])

  useEffect(() => {
    if (mode !== 'video') setExtractOpen(false)
  }, [mode])

  const handlePreset = (presetId: PresetId) => {
    if (presetId === 'extract-frames') {
      setExtractOpen((open) => !open)
      setVisible(true)
      clearHideTimer()
      return
    }
    const paths = getPresetInputPaths(presetId, nodes)
    void runPresetJob(presetId, paths)
    setExtractOpen(false)
    reveal()
  }

  const handleExtractRun = (options: PresetOptions) => {
    const paths = getPresetInputPaths('extract-frames', nodes)
    void runPresetJob('extract-frames', paths, options)
    reveal()
  }

  // Mixed / empty selection: keep nodes selected, but do not render a menu that
  // could intercept canvas marquee drags.
  if (!hasContent) return null

  return (
    <div
      className={[
        'pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      aria-hidden={!visible}
    >
      <div
        className={[
          'flex items-center gap-2 rounded-xl border border-border-l1 bg-surface-l1/90 px-2 py-1.5 shadow-lg backdrop-blur-sm',
          visible ? 'pointer-events-auto' : 'pointer-events-none',
        ].join(' ')}
        onMouseEnter={() => {
          hoveringRef.current = true
          clearHideTimer()
          setVisible(true)
        }}
        onMouseLeave={() => {
          hoveringRef.current = false
          scheduleHide()
        }}
      >
        {selectionLabel && (
          <>
            <span className="max-w-[10rem] truncate px-1 text-xs text-fg-secondary">
              {selectionLabel}
            </span>
            <div className="h-5 w-px bg-border-l1" />
          </>
        )}

        <div className="flex items-center gap-1">
          {visiblePresets.map((preset) => {
            const enabled = canRunPreset(preset.id, nodes) && status !== 'running'
            const Icon = PRESET_ICONS[preset.id]
            const isExtract = preset.id === 'extract-frames'

            if (isExtract) {
              return (
                <div key={preset.id} className="relative">
                  <button
                    type="button"
                    title={preset.label}
                    disabled={!enabled && !extractOpen}
                    aria-expanded={extractOpen}
                    onClick={() => handlePreset(preset.id)}
                    className={[
                      'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40',
                      extractOpen
                        ? 'border-fg-secondary bg-button-ghost-active text-fg-primary'
                        : 'border-border-l1 bg-surface-l1 text-fg-primary hover:bg-button-ghost-hover',
                    ].join(' ')}
                  >
                    <Icon className="size-3.5" />
                    {preset.shortLabel}
                  </button>
                  <ExtractFramesMenu
                    open={extractOpen}
                    disabled={status === 'running'}
                    placement="up"
                    onClose={() => setExtractOpen(false)}
                    onRun={handleExtractRun}
                  />
                </div>
              )
            }

            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                disabled={!enabled}
                onClick={() => handlePreset(preset.id)}
                className="flex items-center gap-1.5 rounded-lg border border-border-l1 bg-surface-l1 px-2.5 py-1.5 text-xs text-fg-primary transition-colors hover:bg-button-ghost-hover disabled:opacity-40"
              >
                <Icon className="size-3.5" />
                {preset.shortLabel}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

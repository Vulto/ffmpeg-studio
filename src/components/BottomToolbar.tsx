import { useMemo } from 'react'
import {
  Film,
  Hand,
  Maximize2,
  MousePointer2,
  SlidersHorizontal,
} from 'lucide-react'
import {
  PRESETS,
  canRunPreset,
  getInputEntries,
  getPresetInputPaths,
} from '../lib/presets'
import type { PresetId } from '../lib/presets'
import { useRunJob } from '../hooks/useRunJob'
import { useMediaStore } from '../store/mediaStore'

const TOOL_BUTTON =
  'flex size-8 items-center justify-center rounded-lg border border-border-l1 transition-colors'

export function BottomToolbar() {
  const nodes = useMediaStore((s) => s.nodes)
  const activeTool = useMediaStore((s) => s.activeTool)
  const setActiveTool = useMediaStore((s) => s.setActiveTool)
  const entries = useMemo(() => getInputEntries(nodes), [nodes])
  const { runPresetJob, status } = useRunJob()

  const selected = nodes.filter((n) => n.selected)
  const selectionLabel =
    selected.length === 1
      ? `{{${entries.find((e) => e.nodeId === selected[0]!.id)?.index ?? 0}}} ${selected[0]!.data.fileName}`
      : selected.length > 1
        ? `${selected.length} selected`
        : entries.length > 0
          ? `${entries.length} on canvas`
          : 'No media'

  const handlePreset = (presetId: PresetId) => {
    const paths = getPresetInputPaths(presetId, nodes)
    void runPresetJob(presetId, paths)
  }

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border-l1 bg-surface-l1/90 px-2 py-1.5 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Select"
            aria-label="Select tool"
            onClick={() => setActiveTool('select')}
            className={[
              TOOL_BUTTON,
              activeTool === 'select'
                ? 'bg-button-ghost-active text-fg-primary'
                : 'bg-surface-l1 text-fg-secondary hover:bg-button-ghost-hover hover:text-fg-primary',
            ].join(' ')}
          >
            <MousePointer2 className="size-4" />
          </button>
          <button
            type="button"
            title="Pan"
            aria-label="Pan tool"
            onClick={() => setActiveTool('pan')}
            className={[
              TOOL_BUTTON,
              activeTool === 'pan'
                ? 'bg-button-ghost-active text-fg-primary'
                : 'bg-surface-l1 text-fg-secondary hover:bg-button-ghost-hover hover:text-fg-primary',
            ].join(' ')}
          >
            <Hand className="size-4" />
          </button>
        </div>

        <div className="h-5 w-px bg-border-l1" />

        <span className="max-w-[10rem] truncate px-1 text-xs text-fg-secondary">
          {selectionLabel}
        </span>

        <div className="h-5 w-px bg-border-l1" />

        <div className="flex items-center gap-1">
          {PRESETS.map((preset) => {
            const enabled = canRunPreset(preset.id, nodes) && status !== 'running'
            const Icon =
              preset.id === 'upscale'
                ? Maximize2
                : preset.id === 'slideshow'
                  ? SlidersHorizontal
                  : Film

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
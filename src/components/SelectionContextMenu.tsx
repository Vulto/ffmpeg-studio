import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, Link2, Maximize2, Trash2 } from 'lucide-react'
import type { PresetOptions } from '../lib/api'
import {
  canRunPreset,
  getPresetInputPaths,
  nodeHasPath,
} from '../lib/presets'
import { useRunJob } from '../hooks/useRunJob'
import { useMediaStore } from '../store/mediaStore'
import { useTerminalStore } from '../store/terminalStore'
import { ExtractFramesMenu } from './ExtractFramesMenu'
import type { ContextMenuPosition } from './CanvasContextMenu'

type SelectionContextMenuProps = {
  position: ContextMenuPosition
  onClose: () => void
}

export function SelectionContextMenu({
  position,
  onClose,
}: SelectionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const nodes = useMediaStore((s) => s.nodes)
  const removeNode = useMediaStore((s) => s.removeNode)
  const getReferenceIndex = useMediaStore((s) => s.getReferenceIndex)
  const insertReference = useTerminalStore((s) => s.insertReference)
  const { runPresetJob, status } = useRunJob()
  const [extractOpen, setExtractOpen] = useState(false)

  const selected = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const selectedWithPath = useMemo(
    () => selected.filter((n) => nodeHasPath(n)),
    [selected],
  )
  const hasImages = selectedWithPath.some((n) => n.data.kind === 'image')
  const hasVideos = selectedWithPath.some((n) => n.data.kind === 'video')
  const jobBusy = status === 'running'

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const handleReference = () => {
    const ordered = [...selectedWithPath].sort(
      (a, b) => a.position.x - b.position.x,
    )
    for (const node of ordered) {
      const index = getReferenceIndex(node.id)
      if (index !== null) insertReference(index)
    }
    onClose()
  }

  const handleUpscale = () => {
    const paths = getPresetInputPaths('upscale', nodes)
    void runPresetJob('upscale', paths)
    onClose()
  }

  const handleExtractRun = (options: PresetOptions) => {
    const paths = getPresetInputPaths(
      'extract-frames',
      useMediaStore.getState().nodes,
    )
    void runPresetJob('extract-frames', paths, options)
    onClose()
  }

  const handleDelete = () => {
    for (const node of selected) {
      removeNode(node.id)
    }
    onClose()
  }

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-fg-primary transition-colors hover:bg-button-ghost-hover disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Selection menu"
      className="fixed z-50 w-52 rounded-xl border border-border-l1 bg-surface-inset p-1.5 shadow-lg"
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={selectedWithPath.length === 0}
        onClick={handleReference}
        className={itemClass}
      >
        <Link2 className="size-4 shrink-0 text-fg-secondary" />
        Reference in terminal
        {selectedWithPath.length > 1 && (
          <span className="ml-auto text-[10px] text-fg-secondary">
            {selectedWithPath.length}
          </span>
        )}
      </button>

      {hasImages && (
        <button
          type="button"
          role="menuitem"
          disabled={!canRunPreset('upscale', nodes) || jobBusy}
          onClick={handleUpscale}
          className={itemClass}
        >
          <Maximize2 className="size-4 shrink-0 text-fg-secondary" />
          Upscale
          {selectedWithPath.filter((n) => n.data.kind === 'image').length > 1 && (
            <span className="ml-auto text-[10px] text-fg-secondary">
              {selectedWithPath.filter((n) => n.data.kind === 'image').length}
            </span>
          )}
        </button>
      )}

      {hasVideos && (
        <div className="relative">
          <button
            type="button"
            role="menuitem"
            disabled={
              (!canRunPreset('extract-frames', nodes) && !extractOpen) || jobBusy
            }
            onClick={() => setExtractOpen((v) => !v)}
            className={itemClass}
            aria-expanded={extractOpen}
          >
            <Film className="size-4 shrink-0 text-fg-secondary" />
            Extract frames
            {selectedWithPath.filter((n) => n.data.kind === 'video').length >
              1 && (
              <span className="ml-auto text-[10px] text-fg-secondary">
                {
                  selectedWithPath.filter((n) => n.data.kind === 'video')
                    .length
                }
              </span>
            )}
          </button>
          <ExtractFramesMenu
            open={extractOpen}
            disabled={jobBusy}
            placement="down"
            onClose={() => setExtractOpen(false)}
            onRun={handleExtractRun}
          />
        </div>
      )}

      <div className="my-1 h-px bg-border-l1" />

      <button
        type="button"
        role="menuitem"
        disabled={selected.length === 0}
        onClick={handleDelete}
        className={itemClass}
      >
        <Trash2 className="size-4 shrink-0 text-fg-secondary" />
        Delete
        {selected.length > 1 && (
          <span className="ml-auto text-[10px] text-fg-secondary">
            {selected.length}
          </span>
        )}
      </button>
    </div>
  )
}

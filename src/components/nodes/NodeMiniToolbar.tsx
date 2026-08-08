import { useState } from 'react'
import { NodeToolbar, Position } from '@xyflow/react'
import { Film, Link2, Maximize2, Trash2 } from 'lucide-react'
import type { PresetId } from '../../lib/presets'
import type { PresetOptions } from '../../lib/api'
import { useRunJob } from '../../hooks/useRunJob'
import { canRunPreset, getPresetInputPaths } from '../../lib/presets'
import { useMediaStore } from '../../store/mediaStore'
import { useTerminalStore } from '../../store/terminalStore'
import { ExtractFramesMenu } from '../ExtractFramesMenu'

type NodeMiniToolbarProps = {
  nodeId: string
  kind: 'image' | 'video'
  isVisible: boolean
}

export function NodeMiniToolbar({
  nodeId,
  kind,
  isVisible,
}: NodeMiniToolbarProps) {
  const nodes = useMediaStore((s) => s.nodes)
  const removeNode = useMediaStore((s) => s.removeNode)
  const getReferenceIndex = useMediaStore((s) => s.getReferenceIndex)
  const selectNode = useMediaStore((s) => s.selectNode)
  const insertReference = useTerminalStore((s) => s.insertReference)
  const { runPresetJob, status } = useRunJob()
  const [extractOpen, setExtractOpen] = useState(false)

  const handleReference = () => {
    selectNode(nodeId)
    const index = getReferenceIndex(nodeId)
    if (index !== null) insertReference(index)
  }

  const handlePreset = (presetId: PresetId) => {
    selectNode(nodeId)
    const paths = getPresetInputPaths(
      presetId,
      useMediaStore.getState().nodes,
    )
    if (paths.length === 0) return
    void runPresetJob(presetId, paths)
  }

  const handleExtractRun = (options: PresetOptions) => {
    selectNode(nodeId)
    const paths = getPresetInputPaths(
      'extract-frames',
      useMediaStore.getState().nodes,
    )
    if (paths.length === 0) return
    void runPresetJob('extract-frames', paths, options)
  }

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible={isVisible}
      position={Position.Bottom}
      offset={12}
      align="center"
      className="nodrag nopan flex items-center gap-0.5 rounded-xl border border-border-l1 bg-surface-l2 px-1 py-1 shadow-lg"
    >
      <ToolbarButton
        label="Reference in terminal"
        onClick={handleReference}
        icon={<Link2 className="size-3.5" />}
      />
      {kind === 'image' && (
        <ToolbarButton
          label="Upscale"
          onClick={() => handlePreset('upscale')}
          disabled={!canRunPreset('upscale', nodes) || status === 'running'}
          icon={<Maximize2 className="size-3.5" />}
        />
      )}
      {kind === 'video' && (
        <div className="relative">
          <ToolbarButton
            label="Extract frames"
            onClick={() => setExtractOpen((v) => !v)}
            disabled={
              (!canRunPreset('extract-frames', nodes) && !extractOpen) ||
              status === 'running'
            }
            icon={<Film className="size-3.5" />}
            active={extractOpen}
          />
          <ExtractFramesMenu
            open={extractOpen && isVisible}
            disabled={status === 'running'}
            placement="down"
            onClose={() => setExtractOpen(false)}
            onRun={handleExtractRun}
          />
        </div>
      )}
      <ToolbarButton
        label="Delete"
        onClick={() => removeNode(nodeId)}
        icon={<Trash2 className="size-3.5" />}
      />
    </NodeToolbar>
  )
}

function ToolbarButton({
  label,
  onClick,
  icon,
  disabled,
  active,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={active}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex size-7 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        active
          ? 'bg-button-ghost-active text-fg-primary'
          : 'text-fg-secondary hover:bg-button-ghost-hover hover:text-fg-primary',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

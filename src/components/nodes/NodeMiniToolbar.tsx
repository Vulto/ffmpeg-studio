import { NodeToolbar, Position } from '@xyflow/react'
import { Film, Link2, Maximize2, Trash2 } from 'lucide-react'
import type { PresetId } from '../../lib/presets'
import { useRunJob } from '../../hooks/useRunJob'
import { canRunPreset, getPresetInputPaths } from '../../lib/presets'
import { useMediaStore } from '../../store/mediaStore'
import { useTerminalStore } from '../../store/terminalStore'

type NodeMiniToolbarProps = {
  nodeId: string
  kind: 'image' | 'video'
  isVisible: boolean
}

export function NodeMiniToolbar({ nodeId, kind, isVisible }: NodeMiniToolbarProps) {
  const nodes = useMediaStore((s) => s.nodes)
  const removeNode = useMediaStore((s) => s.removeNode)
  const getReferenceIndex = useMediaStore((s) => s.getReferenceIndex)
  const selectNode = useMediaStore((s) => s.selectNode)
  const insertReference = useTerminalStore((s) => s.insertReference)
  const { runPresetJob, status } = useRunJob()

  const handleReference = () => {
    selectNode(nodeId)
    const index = getReferenceIndex(nodeId)
    if (index !== null) insertReference(index)
  }

  const handlePreset = (presetId: PresetId) => {
    selectNode(nodeId)
    const paths = getPresetInputPaths(presetId, nodes)
    void runPresetJob(presetId, paths)
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
        <ToolbarButton
          label="Extract frames"
          onClick={() => handlePreset('extract-frames')}
          disabled={!canRunPreset('extract-frames', nodes) || status === 'running'}
          icon={<Film className="size-3.5" />}
        />
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
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-7 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-button-ghost-hover hover:text-fg-primary disabled:opacity-40"
    >
      {icon}
    </button>
  )
}
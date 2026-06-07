import type { ReactNode } from 'react'
import { useMediaStore } from '../../store/mediaStore'
import { useTerminalStore } from '../../store/terminalStore'
import { parseReferenceTokens } from '../../lib/presets'
import { NodeMiniToolbar } from './NodeMiniToolbar'

type MediaNodeChromeProps = {
  nodeId: string
  kind: 'image' | 'video'
  selected: boolean
  width: number
  children: ReactNode
}

export function MediaNodeChrome({
  nodeId,
  kind,
  selected,
  width,
  children,
}: MediaNodeChromeProps) {
  const command = useTerminalStore((s) => s.command)
  const refIndex = useMediaStore((s) => s.getReferenceIndex(nodeId))
  const selectedCount = useMediaStore(
    (s) => s.nodes.filter((n) => n.selected).length,
  )

  const showToolbar = selected && selectedCount === 1
  const referenced =
    refIndex !== null && parseReferenceTokens(command).includes(refIndex)

  return (
    <div className="relative" style={{ width }}>
      <NodeMiniToolbar nodeId={nodeId} kind={kind} isVisible={showToolbar} />
      <div
        className={[
          'media-node relative overflow-hidden rounded-xl border border-border-l1 bg-node-bg shadow-lg',
          referenced
            ? 'ring-2 ring-accent'
            : selected
              ? 'ring-2 ring-white/30'
              : '',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  )
}
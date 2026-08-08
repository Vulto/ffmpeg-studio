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
  // Primitive / stable selectors only — never return a new array from useMediaStore.
  const refIndex = useMediaStore((s) => s.getReferenceIndex(nodeId))
  const selectedCount = useMediaStore(
    (s) => s.nodes.reduce((n, node) => n + (node.selected ? 1 : 0), 0),
  )
  const operation = useMediaStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.operation,
  )

  // Single-select only — multi-select actions live on right-click SelectionContextMenu.
  const showToolbar = selected && selectedCount === 1

  const referenced =
    refIndex !== null && parseReferenceTokens(command).includes(refIndex)

  return (
    <div className="relative" style={{ width }}>
      <NodeMiniToolbar
        nodeId={nodeId}
        kind={kind}
        isVisible={showToolbar}
      />
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

        {operation && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
            aria-label={`${operation.label}${
              operation.progress !== null
                ? ` ${Math.round(operation.progress)}%`
                : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 bg-black/65 px-2 py-1 backdrop-blur-[2px]">
              <span className="truncate text-[10px] font-medium text-white/90">
                {operation.label}
                {operation.progress !== null
                  ? ` ${Math.round(operation.progress)}%`
                  : '…'}
              </span>
            </div>
            <div className="h-1 w-full bg-black/40">
              {operation.progress === null ? (
                <div className="node-progress-indeterminate h-full w-1/3 bg-accent" />
              ) : (
                <div
                  className="h-full bg-accent transition-[width] duration-150 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, operation.progress))}%`,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

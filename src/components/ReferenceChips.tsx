import { useMemo } from 'react'
import { getInputEntries, parseReferenceTokens } from '../lib/presets'
import { useMediaStore } from '../store/mediaStore'
import { useTerminalStore } from '../store/terminalStore'

export function ReferenceChips() {
  const command = useTerminalStore((s) => s.command)
  const nodes = useMediaStore((s) => s.nodes)
  const entries = useMemo(() => getInputEntries(nodes), [nodes])
  const selectNode = useMediaStore((s) => s.selectNode)
  const tokens = parseReferenceTokens(command)

  if (tokens.length === 0) return null

  const unique = [...new Set(tokens)].sort((a, b) => a - b)

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {unique.map((index) => {
        const entry = entries.find((e) => e.index === index)
        return (
          <button
            key={index}
            type="button"
            onClick={() => entry && selectNode(entry.nodeId)}
            className="rounded-md border border-border-l1 bg-surface-inset px-2 py-0.5 font-mono text-[10px] text-fg-secondary transition-colors hover:border-accent hover:text-fg-primary"
          >
            {`{{${index}}}`}
            {entry ? ` ${entry.fileName}` : ''}
          </button>
        )
      })}
    </div>
  )
}
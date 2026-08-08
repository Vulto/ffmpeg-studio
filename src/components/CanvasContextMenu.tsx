import { Upload } from 'lucide-react'
import { useEffect, useRef } from 'react'

export type ContextMenuPosition = {
  x: number
  y: number
}

type CanvasContextMenuProps = {
  position: ContextMenuPosition
  onImport: () => void
  onClose: () => void
}

export function CanvasContextMenu({
  position,
  onImport,
  onClose,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

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

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Canvas menu"
      className="fixed z-50 w-44 rounded-xl border border-border-l1 bg-surface-inset p-1.5 shadow-lg"
      style={{ left: position.x, top: position.y }}
    >
      <button
        type="button"
        role="menuitem"
        title="Import media"
        aria-label="Import media"
        onClick={() => {
          onImport()
          onClose()
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-fg-primary transition-colors hover:bg-button-ghost-hover"
      >
        <Upload className="size-4 shrink-0 text-fg-secondary" />
        Import media
      </button>
    </div>
  )
}

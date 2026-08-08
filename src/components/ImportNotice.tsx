import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useMediaStore } from '../store/mediaStore'

const DISMISS_MS = 10_000

export function ImportNotice() {
  const notice = useMediaStore((s) => s.importNotice)
  const setImportNotice = useMediaStore((s) => s.setImportNotice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setImportNotice(null), DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notice, setImportNotice])

  if (!notice) return null

  return (
    <div
      role="alert"
      className="pointer-events-none absolute left-1/2 top-4 z-40 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2"
    >
      <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-red-500/40 bg-surface-inset/95 px-3 py-3 shadow-lg backdrop-blur-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-fg-primary">
          {notice}
        </p>
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss"
          onClick={() => setImportNotice(null)}
          className="rounded-lg p-1 text-fg-secondary transition-colors hover:bg-button-ghost-hover hover:text-fg-primary"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

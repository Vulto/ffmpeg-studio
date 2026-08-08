import { ImagePlus } from 'lucide-react'
import { MAX_UPLOAD_LABEL } from '../lib/media'

type EmptyCanvasProps = {
  onImport: () => void
}

export function EmptyCanvas({ onImport }: EmptyCanvasProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-4 rounded-xl border border-border-l1 bg-surface-inset/90 px-8 py-10 text-center backdrop-blur-sm">
        <div className="flex size-12 items-center justify-center rounded-xl bg-button-ghost-hover">
          <ImagePlus className="size-6 text-fg-secondary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-fg-primary">Drop images or videos</h2>
          <p className="text-xs text-fg-secondary">
            Drag files onto the canvas or import from your device.
            Max file size {MAX_UPLOAD_LABEL}.
          </p>
        </div>
        <button
          type="button"
          onClick={onImport}
          className="rounded-xl bg-fg-primary px-4 py-2 text-xs font-medium text-surface-base transition-opacity hover:opacity-90"
        >
          Import media
        </button>
      </div>
    </div>
  )
}
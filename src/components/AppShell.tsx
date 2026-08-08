import { MediaCanvas } from './MediaCanvas'
import { TerminalPanel } from './TerminalPanel'

export function AppShell() {
  return (
    <div className="flex h-svh w-full flex-col">
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 bg-canvas-bg">
          <MediaCanvas />
        </main>
        <TerminalPanel />
      </div>
    </div>
  )
}

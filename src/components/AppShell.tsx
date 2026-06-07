import { useCallback, useRef } from 'react'
import { MediaCanvas } from './MediaCanvas'
import { Sidebar } from './Sidebar'
import { TerminalPanel } from './TerminalPanel'

export function AppShell() {
  const importRef = useRef<(() => void) | null>(null)

  const handleImportReady = useCallback((openImport: () => void) => {
    importRef.current = openImport
  }, [])

  const handleImport = useCallback(() => {
    importRef.current?.()
  }, [])

  return (
    <div className="flex h-svh w-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar onImport={handleImport} />
        <main className="relative min-w-0 flex-1 bg-canvas-bg">
          <MediaCanvas onImportReady={handleImportReady} />
        </main>
        <TerminalPanel />
      </div>
    </div>
  )
}
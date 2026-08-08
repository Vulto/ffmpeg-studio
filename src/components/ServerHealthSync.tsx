import { useEffect } from 'react'
import { checkHealth } from '../lib/api'
import { useTerminalStore } from '../store/terminalStore'

const POLL_MS = 10_000

/**
 * Keeps API / ffmpeg health in the store for the whole app lifetime.
 * Must not depend on the terminal panel being open — presets and jobs
 * gate on serverOnline and previously only updated when the terminal mounted.
 */
export function ServerHealthSync() {
  const setServerHealth = useTerminalStore((s) => s.setServerHealth)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const health = await checkHealth()
        if (cancelled) return
        setServerHealth(true, health.ffmpeg)
      } catch {
        if (!cancelled) setServerHealth(false)
      }
    }

    void poll()
    const interval = setInterval(() => void poll(), POLL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [setServerHealth])

  return null
}

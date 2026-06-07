import { useCallback, useRef } from 'react'
import {
  runFfmpegCommand,
  runPreset,
  type OutputFileInfo,
  type PresetId,
} from '../lib/api'
import { handleStreamEvent } from '../lib/jobEvents'
import { useMediaStore } from '../store/mediaStore'
import { useTerminalStore } from '../store/terminalStore'

export function useRunJob() {
  const abortRef = useRef<AbortController | null>(null)
  const addOutputPreviews = useMediaStore((s) => s.addOutputPreviews)
  const getSelectedInputPaths = useMediaStore((s) => s.getSelectedInputPaths)
  const {
    status,
    setStatus,
    logWriteln,
    logWrite,
    pushHistory,
    setCommand,
    command,
  } = useTerminalStore()

  const getLogger = useCallback(() => {
    const writeln = (text: string) => {
      const fn = useTerminalStore.getState().logger?.writeln ?? logWriteln
      fn?.(text)
    }
    const write = (text: string) => {
      const fn = useTerminalStore.getState().logger?.write ?? logWrite
      fn?.(text)
    }
    return { writeln, write }
  }, [logWriteln, logWrite])

  const finishJob = useCallback(
    async (exitCode: number, outputs: OutputFileInfo[]) => {
      if (exitCode === 0 && outputs.length > 0) {
        await addOutputPreviews(outputs)
        getLogger().writeln(`\x1b[32m→\x1b[0m added ${outputs.length} output(s) to canvas`)
      }
      setStatus(exitCode === 0 ? 'idle' : 'error')
    },
    [addOutputPreviews, getLogger, setStatus],
  )

  const runCommand = useCallback(
    async (cmd?: string) => {
      const trimmed = (cmd ?? command).trim()
      if (!trimmed || status === 'running') return

      const { serverOnline, ffmpegAvailable } = useTerminalStore.getState()
      if (!serverOnline) {
        getLogger().writeln('\x1b[31merror:\x1b[0m API server offline')
        return
      }
      if (!ffmpegAvailable) {
        getLogger().writeln('\x1b[31merror:\x1b[0m ffmpeg not available on server')
        return
      }

      const inputPaths = getSelectedInputPaths()
      if (inputPaths.length === 0) {
        getLogger().writeln('\x1b[31merror:\x1b[0m no media paths available')
        return
      }

      pushHistory(trimmed)
      setCommand('')
      setStatus('running')
      getLogger().writeln('')
      getLogger().writeln(`\x1b[36m$\x1b[0m ${trimmed}`)

      abortRef.current?.abort()
      abortRef.current = new AbortController()

      try {
        const logger = getLogger()
        const { exitCode, outputs } = await runFfmpegCommand(
          trimmed,
          inputPaths,
          (event) => handleStreamEvent(event, logger),
          abortRef.current.signal,
        )
        await finishJob(exitCode, outputs)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          getLogger().writeln('\x1b[33m(cancelled)\x1b[0m')
          setStatus('idle')
          return
        }
        getLogger().writeln(
          `\x1b[31merror:\x1b[0m ${err instanceof Error ? err.message : 'unknown'}`,
        )
        setStatus('error')
      }
    },
    [
      command,
      status,
      getSelectedInputPaths,
      pushHistory,
      setCommand,
      setStatus,
      getLogger,
      finishJob,
    ],
  )

  const runPresetJob = useCallback(
    async (presetId: PresetId, inputPaths: string[]) => {
      if (status === 'running') return

      const { serverOnline } = useTerminalStore.getState()
      if (!serverOnline) {
        getLogger().writeln('\x1b[31merror:\x1b[0m API server offline')
        return
      }

      if (inputPaths.length === 0) {
        getLogger().writeln('\x1b[31merror:\x1b[0m no valid inputs for preset')
        return
      }

      setStatus('running')
      getLogger().writeln('')
      getLogger().writeln(`\x1b[36m$\x1b[0m preset ${presetId}`)

      abortRef.current?.abort()
      abortRef.current = new AbortController()

      try {
        const logger = getLogger()
        const { exitCode, outputs } = await runPreset(
          presetId,
          inputPaths,
          (event) => handleStreamEvent(event, logger),
          abortRef.current.signal,
        )
        await finishJob(exitCode, outputs)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          getLogger().writeln('\x1b[33m(cancelled)\x1b[0m')
          setStatus('idle')
          return
        }
        getLogger().writeln(
          `\x1b[31merror:\x1b[0m ${err instanceof Error ? err.message : 'unknown'}`,
        )
        setStatus('error')
      }
    },
    [status, setStatus, getLogger, finishJob],
  )

  return { runCommand, runPresetJob, status }
}
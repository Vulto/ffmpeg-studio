import { useCallback, useRef } from 'react'
import {
  checkHealth,
  runFfmpegCommand,
  runPreset,
  type OutputFileInfo,
  type PresetId,
  type PresetOptions,
} from '../lib/api'
import { progressPercentFromPartial } from '../lib/ffmpegProgress'
import { handleStreamEvent } from '../lib/jobEvents'
import { useMediaStore } from '../store/mediaStore'
import { useTerminalStore } from '../store/terminalStore'

const PRESET_LABELS: Record<PresetId, string> = {
  upscale: 'Upscaling',
  slideshow: 'Making video',
  'extract-frames': 'Extracting frames',
}

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

  /** Ensure health is known even before the first poll completes. */
  const ensureServerOnline = useCallback(async (): Promise<boolean> => {
    const state = useTerminalStore.getState()
    if (state.serverOnline) return true
    try {
      const health = await checkHealth()
      state.setServerHealth(true, health.ffmpeg)
      return true
    } catch {
      state.setServerHealth(false)
      return false
    }
  }, [])

  const finishJob = useCallback(
    async (exitCode: number, outputs: OutputFileInfo[], sourceNodeIds: string[]) => {
      useMediaStore.getState().setNodesOperation(sourceNodeIds, null)
      if (exitCode === 0 && outputs.length > 0) {
        await addOutputPreviews(outputs)
        getLogger().writeln(`\x1b[32m→\x1b[0m added ${outputs.length} output(s) to canvas`)
      }
      setStatus(exitCode === 0 ? 'idle' : 'error')
    },
    [addOutputPreviews, getLogger, setStatus],
  )

  const bindJobProgress = useCallback((sourceNodeIds: string[], label: string) => {
    const store = useMediaStore.getState()
    store.setNodesOperation(sourceNodeIds, {
      kind: 'job',
      label,
      progress: null,
    })

    const durations = sourceNodeIds.map((id) => {
      const node = store.nodes.find((n) => n.id === id)
      return node?.data.duration
    })
    const durationSec = durations.find((d) => d !== undefined && d > 0)

    return (partial: { timeSec?: number; frame?: number }) => {
      const pct = progressPercentFromPartial(partial, durationSec)
      if (pct === null) return
      useMediaStore.getState().setNodesOperation(sourceNodeIds, {
        kind: 'job',
        label,
        progress: pct,
      })
    }
  }, [])

  const runCommand = useCallback(
    async (cmd?: string) => {
      const trimmed = (cmd ?? command).trim()
      if (!trimmed || status === 'running') return

      if (!(await ensureServerOnline())) {
        getLogger().writeln('\x1b[31merror:\x1b[0m API server offline')
        return
      }
      if (!useTerminalStore.getState().ffmpegAvailable) {
        getLogger().writeln('\x1b[31merror:\x1b[0m ffmpeg not available on server')
        return
      }

      const inputPaths = getSelectedInputPaths()
      if (inputPaths.length === 0) {
        getLogger().writeln('\x1b[31merror:\x1b[0m no media paths available')
        return
      }

      const sourceNodeIds = useMediaStore.getState().findNodeIdsByPaths(inputPaths)
      const onProgress = bindJobProgress(sourceNodeIds, 'Running')

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
          (event) => handleStreamEvent(event, logger, onProgress),
          abortRef.current.signal,
        )
        await finishJob(exitCode, outputs, sourceNodeIds)
      } catch (err) {
        useMediaStore.getState().setNodesOperation(sourceNodeIds, null)
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
      bindJobProgress,
      ensureServerOnline,
    ],
  )

  const runSinglePreset = useCallback(
    async (
      presetId: PresetId,
      inputPaths: string[],
      options: PresetOptions | undefined,
      signal: AbortSignal,
    ): Promise<{ exitCode: number; outputs: OutputFileInfo[] }> => {
      const sourceNodeIds = useMediaStore.getState().findNodeIdsByPaths(inputPaths)
      const label = PRESET_LABELS[presetId] ?? 'Running'
      const onProgress = bindJobProgress(sourceNodeIds, label)

      const optionLabel =
        presetId === 'extract-frames' && options
          ? options.mode === 'all'
            ? ' (all frames)'
            : options.mode === 'unique'
              ? ' (unique frames)'
              : ` (fps=${options.fps ?? 1})`
          : ''
      getLogger().writeln('')
      getLogger().writeln(`\x1b[36m$\x1b[0m preset ${presetId}${optionLabel}`)

      try {
        const logger = getLogger()
        const result = await runPreset(
          presetId,
          inputPaths,
          (event) => handleStreamEvent(event, logger, onProgress),
          signal,
          options,
        )
        useMediaStore.getState().setNodesOperation(sourceNodeIds, null)
        return result
      } catch (err) {
        useMediaStore.getState().setNodesOperation(sourceNodeIds, null)
        throw err
      }
    },
    [bindJobProgress, getLogger],
  )

  const runPresetJob = useCallback(
    async (presetId: PresetId, inputPaths: string[], options?: PresetOptions) => {
      if (status === 'running') return

      if (!(await ensureServerOnline())) {
        getLogger().writeln('\x1b[31merror:\x1b[0m API server offline')
        return
      }

      if (inputPaths.length === 0) {
        getLogger().writeln('\x1b[31merror:\x1b[0m no valid inputs for preset')
        return
      }

      setStatus('running')
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      const signal = abortRef.current.signal

      // Upscale / extract-frames: one path per job so each file gets its own progress.
      const batchSeparately =
        (presetId === 'upscale' || presetId === 'extract-frames') &&
        inputPaths.length > 1

      try {
        if (!batchSeparately) {
          const sourceNodeIds = useMediaStore
            .getState()
            .findNodeIdsByPaths(inputPaths)
          const { exitCode, outputs } = await runSinglePreset(
            presetId,
            inputPaths,
            options,
            signal,
          )
          await finishJob(exitCode, outputs, sourceNodeIds)
          return
        }

        const allOutputs: OutputFileInfo[] = []
        let lastExit = 0
        for (const path of inputPaths) {
          if (signal.aborted) break
          try {
            const { exitCode, outputs } = await runSinglePreset(
              presetId,
              [path],
              options,
              signal,
            )
            lastExit = exitCode
            allOutputs.push(...outputs)
            if (exitCode !== 0) {
              getLogger().writeln(
                `\x1b[33mwarning:\x1b[0m preset failed for ${path} (exit ${exitCode}), continuing`,
              )
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') throw err
            getLogger().writeln(
              `\x1b[31merror:\x1b[0m ${err instanceof Error ? err.message : 'unknown'} (${path})`,
            )
            lastExit = 1
          }
        }
        await finishJob(lastExit, allOutputs, [])
      } catch (err) {
        useMediaStore.getState().clearAllOperations()
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
    [status, setStatus, getLogger, finishJob, runSinglePreset, ensureServerOnline],
  )

  return { runCommand, runPresetJob, status }
}

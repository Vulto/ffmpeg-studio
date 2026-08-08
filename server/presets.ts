import { readdir, stat, writeFile } from 'node:fs/promises'
import { join, basename, extname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  collectExistingOutputs,
  fileExists,
  mimeFromPath,
  probeMediaFile,
  resolveWorkspacePath,
} from './workspace'

export type PresetId = 'upscale' | 'slideshow' | 'extract-frames'

export type ExtractFrameMode = 'all' | 'unique' | 'fps'

export type PresetOptions = {
  mode?: ExtractFrameMode
  /** Only used when mode is `fps`. Ignored for `all` and `unique`. */
  fps?: number
}

export type PresetOutput = {
  relativePath: string
  fileName: string
  mimeType: string
  size: number
}

export type PresetEvent = {
  type: 'meta' | 'stdout' | 'stderr' | 'output' | 'exit'
  data: string
}

const REALESRGAN_BIN = process.env.REALESRGAN_BIN ?? 'realesrgan-ncnn-vulkan'
const REALESRGAN_SCALE = Number(process.env.REALESRGAN_SCALE ?? 4)
const REALESRGAN_TILE_OVERRIDE = Number(process.env.REALESRGAN_TILE ?? 0)
/** Soft cap for canvas/SSE when sampling by fps. */
const MAX_FRAMES_FPS = 100
/** Soft cap for canvas/SSE for unique frames. */
const MAX_FRAMES_UNIQUE = 500
/**
 * Soft cap for canvas/SSE when extracting every frame.
 * All frames are still written to disk; only canvas/SSE are capped.
 */
const MAX_FRAMES_ALL = 2000
const MAX_FPS = 60
const VULKAN_FAIL_MARKER = 'vkQueueSubmit failed'

export function normalizeExtractOptions(options?: PresetOptions): {
  mode: ExtractFrameMode
  fps: number
} {
  const raw = options?.mode
  const mode: ExtractFrameMode =
    raw === 'all' || raw === 'unique' || raw === 'fps' ? raw : 'fps'

  // fps only applies to sample-rate mode — never bleed into all/unique.
  let fps = 1
  if (mode === 'fps') {
    fps = Number(options?.fps ?? 1)
    if (!Number.isFinite(fps) || fps <= 0) fps = 1
    if (fps > MAX_FPS) fps = MAX_FPS
  }

  return { mode, fps }
}

function buildExtractFrameArgs(
  input: string,
  outPattern: string,
  mode: ExtractFrameMode,
  fps: number,
): string[] {
  if (mode === 'all') {
    // Every decoded frame — no fps= filter. passthrough avoids dropping frames.
    return [
      '-i',
      input,
      '-fps_mode',
      'passthrough',
      '-y',
      outPattern,
    ]
  }

  if (mode === 'unique') {
    // Drop near-duplicate frames, keep timestamps valid for image sequence.
    return [
      '-i',
      input,
      '-vf',
      'mpdecimate,setpts=N/FRAME_RATE/TB',
      '-fps_mode',
      'vfr',
      '-y',
      outPattern,
    ]
  }

  // Sample rate — independent of all/unique.
  return ['-i', input, '-vf', `fps=${fps}`, '-y', outPattern]
}

function canvasLimitForMode(mode: ExtractFrameMode): number {
  if (mode === 'all') return MAX_FRAMES_ALL
  if (mode === 'unique') return MAX_FRAMES_UNIQUE
  return MAX_FRAMES_FPS
}

function toWorkspaceRelative(workspace: string, inputPath: string): string {
  const absWorkspace = resolve(workspace)
  const absPath = resolve(inputPath)
  if (absPath.startsWith(`${absWorkspace}/`)) {
    return absPath.slice(absWorkspace.length + 1)
  }
  return inputPath
}

export async function checkRealesrgan(): Promise<{
  ok: boolean
  path?: string
  error?: string
}> {
  return new Promise((resolve) => {
    const proc = spawn(REALESRGAN_BIN, ['-h'])
    proc.on('close', (code) => {
      if (code === 0 || code === 255) {
        resolve({ ok: true, path: REALESRGAN_BIN })
      } else {
        resolve({ ok: false, error: `${REALESRGAN_BIN} unavailable` })
      }
    })
    proc.on('error', () =>
      resolve({ ok: false, error: `${REALESRGAN_BIN} not found` }),
    )
  })
}

function escapeConcatPath(absPath: string): string {
  return absPath.replace(/'/g, "'\\''")
}

async function collectFrameOutputs(
  workspace: string,
  pattern: string,
  limit: number,
): Promise<{ frames: PresetOutput[]; total: number }> {
  const outputsDir = join(workspace, 'outputs')
  const prefix = pattern.replace(/_%04d\.png$/, '').replace(/^outputs\//, '')
  const entries = await readdir(outputsDir).catch(() => [] as string[])
  const results: PresetOutput[] = []

  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith('.png')) continue
    const full = join(outputsDir, name)
    const info = await stat(full)
    if (!info.isFile() || info.size === 0) continue
    results.push({
      relativePath: `outputs/${name}`,
      fileName: name,
      mimeType: 'image/png',
      size: info.size,
    })
  }

  const sorted = results.sort((a, b) => a.fileName.localeCompare(b.fileName))
  return { frames: sorted.slice(0, limit), total: sorted.length }
}

type ProcessResult = {
  exitCode: number
  stderr: string
}

function runProcess(
  bin: string,
  args: string[],
  cwd: string,
  onEvent: (event: PresetEvent) => void,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let finished = false
    let stderr = ''

    const proc = spawn(bin, args, { cwd, shell: false })

    proc.stdout.on('data', (chunk) =>
      onEvent({ type: 'stdout', data: chunk.toString() }),
    )
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      onEvent({ type: 'stderr', data: text })
    })

    const done = (code: number) => {
      if (finished) return
      finished = true
      proc.stdout.removeAllListeners('data')
      proc.stderr.removeAllListeners('data')
      resolve({ exitCode: code, stderr })
    }

    proc.on('close', (code) => done(code ?? 1))
    proc.on('error', (err) => {
      onEvent({ type: 'stderr', data: `${err.message}\n` })
      done(1)
    })
  })
}

function computeTileSize(width: number, height: number): number {
  if (REALESRGAN_TILE_OVERRIDE > 0) return REALESRGAN_TILE_OVERRIDE

  const pixels = width * height
  // Tile processing avoids Vulkan OOM on integrated GPUs (vkQueueSubmit -4).
  if (pixels > 512 * 512) return 64
  return 0
}

function buildRealesrganArgs(
  inputRel: string,
  outRel: string,
  tileSize: number,
): string[] {
  const args = [
    '-i',
    inputRel,
    '-o',
    outRel,
    '-n',
    'realesrgan-x4plus',
    '-s',
    String(REALESRGAN_SCALE),
  ]
  if (tileSize > 0) args.push('-t', String(tileSize))
  return args
}

async function runFfmpegUpscaleFallback(
  inputRel: string,
  outRel: string,
  workspace: string,
  onEvent: (event: PresetEvent) => void,
): Promise<ProcessResult> {
  const args = [
    '-i',
    inputRel,
    '-vf',
    `scale=iw*${REALESRGAN_SCALE}:ih*${REALESRGAN_SCALE}:flags=lanczos`,
    '-y',
    outRel,
  ]
  onEvent({
    type: 'meta',
    data: `ffmpeg fallback (GPU upscale failed): ffmpeg ${args.join(' ')}`,
  })
  return runProcess('ffmpeg', args, workspace, onEvent)
}

async function runRealesrganUpscale(
  inputFull: string,
  inputRel: string,
  outRel: string,
  outFull: string,
  workspace: string,
  onEvent: (event: PresetEvent) => void,
): Promise<ProcessResult> {
  const probe = await probeMediaFile(inputFull)
  const initialTile = probe
    ? computeTileSize(probe.width, probe.height)
    : REALESRGAN_TILE_OVERRIDE || 64

  const tileAttempts = [
    ...new Set(
      [initialTile, initialTile > 0 ? 32 : 64].filter((t) => t >= 0),
    ),
  ]

  for (const tileSize of tileAttempts) {
    const args = buildRealesrganArgs(inputRel, outRel, tileSize)
    onEvent({
      type: 'meta',
      data: `${REALESRGAN_BIN} ${args.join(' ')}`,
    })

    const result = await runProcess(REALESRGAN_BIN, args, workspace, onEvent)
    const vulkanFailed = result.stderr.includes(VULKAN_FAIL_MARKER)
    const outputReady = await fileExists(outFull)

    if (result.exitCode === 0 && outputReady && !vulkanFailed) {
      return result
    }

    if (vulkanFailed) {
      onEvent({
        type: 'meta',
        data:
          tileSize === tileAttempts[tileAttempts.length - 1]
            ? 'Vulkan GPU error — switching to ffmpeg fallback'
            : `Vulkan GPU error at tile=${tileSize}, retrying with smaller tiles`,
      })
    }
  }

  return runFfmpegUpscaleFallback(inputRel, outRel, workspace, onEvent)
}

export async function runPreset(
  presetId: PresetId,
  inputPaths: string[],
  workspace: string,
  onEvent: (event: PresetEvent) => void,
  options?: PresetOptions,
): Promise<{ exitCode: number; outputs: PresetOutput[] }> {
  const jobId = randomUUID().slice(0, 8)
  const outputs: PresetOutput[] = []

  if (presetId === 'upscale') {
    const input = inputPaths[0]
    if (!input) throw new Error('Upscale requires one image input')

    const inputRel = toWorkspaceRelative(workspace, input)
    const inputFull = join(workspace, inputRel)
    const base = basename(input, extname(input))
    const outRel = `outputs/upscaled_${base}_${jobId}.png`
    const outFull = join(workspace, outRel)

    onEvent({ type: 'meta', data: `$ preset upscale` })

    const { exitCode: exit } = await runRealesrganUpscale(
      inputFull,
      inputRel,
      outRel,
      outFull,
      workspace,
      onEvent,
    )

    if (exit === 0 && (await fileExists(outFull))) {
      const info = await stat(outFull)
      const output: PresetOutput = {
        relativePath: outRel,
        fileName: basename(outRel),
        mimeType: mimeFromPath(outFull),
        size: info.size,
      }
      outputs.push(output)
      onEvent({ type: 'output', data: JSON.stringify(output) })
    }

    return { exitCode: exit, outputs }
  }

  if (presetId === 'slideshow') {
    if (inputPaths.length < 2) {
      throw new Error('Slideshow requires at least 2 images')
    }

    const concatName = `concat-${jobId}.txt`
    const concatPath = join(workspace, concatName)
    const lines = inputPaths.flatMap((p) => [
      `file '${escapeConcatPath(p)}'`,
      'duration 2',
    ])
    lines.push(`file '${escapeConcatPath(inputPaths[inputPaths.length - 1]!)}'`)
    await writeFile(concatPath, lines.join('\n') + '\n')

    const outRel = `outputs/slideshow_${jobId}.mp4`
    const args = [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatName,
      '-vf',
      'fps=30,scale=1280:-2,format=yuv420p',
      '-y',
      outRel,
    ]

    onEvent({ type: 'meta', data: `$ preset slideshow (${inputPaths.length} images)` })
    onEvent({ type: 'meta', data: `ffmpeg ${args.join(' ')}` })

    const { exitCode: exit } = await runProcess('ffmpeg', args, workspace, onEvent)

    if (exit === 0) {
      const found = await collectExistingOutputs(workspace, args)
      for (const o of found) {
        outputs.push(o)
        onEvent({ type: 'output', data: JSON.stringify(o) })
      }
    }

    return { exitCode: exit, outputs }
  }

  if (presetId === 'extract-frames') {
    const input = inputPaths[0]
    if (!input) throw new Error('Extract frames requires one video input')

    const { mode, fps } = normalizeExtractOptions(options)
    const outPattern = `outputs/frames_${jobId}_%04d.png`
    const canvasLimit = canvasLimitForMode(mode)
    const args = buildExtractFrameArgs(input, outPattern, mode, fps)

    const modeLabel =
      mode === 'all'
        ? 'all frames'
        : mode === 'unique'
          ? 'unique frames'
          : `fps=${fps}`

    onEvent({
      type: 'meta',
      data: `$ preset extract-frames (${modeLabel}; canvas max ${canvasLimit})`,
    })
    onEvent({ type: 'meta', data: `ffmpeg ${args.join(' ')}` })

    const { exitCode: exit } = await runProcess('ffmpeg', args, workspace, onEvent)

    if (exit === 0) {
      const { frames, total } = await collectFrameOutputs(
        workspace,
        outPattern,
        canvasLimit,
      )
      for (const frame of frames) {
        outputs.push(frame)
        onEvent({ type: 'output', data: JSON.stringify(frame) })
      }
      if (total > frames.length) {
        onEvent({
          type: 'meta',
          data: `wrote ${total} frames to disk (${modeLabel}); showing first ${frames.length} on canvas (rest in outputs/)`,
        })
      } else {
        onEvent({
          type: 'meta',
          data: `extracted ${total} frame(s) (${modeLabel})`,
        })
      }
    }

    return { exitCode: exit, outputs }
  }

  throw new Error(`Unknown preset: ${presetId}`)
}

export function normalizePresetInputPaths(
  workspace: string,
  paths: string[],
): string[] {
  return paths.map((p) => {
    if (p.startsWith('/')) return p
    const resolved = resolveWorkspacePath(workspace, p)
    return resolved ?? p
  })
}
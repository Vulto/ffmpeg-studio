import { access, stat } from 'node:fs/promises'
import { join, resolve, basename, extname } from 'node:path'
import { spawn } from 'node:child_process'

const PREVIEW_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
])

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const FLAG_TAKES_VALUE = new Set([
  '-i',
  '-vf',
  '-filter_complex',
  '-c:v',
  '-c:a',
  '-b:v',
  '-b:a',
  '-r',
  '-s',
  '-aspect',
  '-metadata',
  '-map',
  '-codec',
  '-vcodec',
  '-acodec',
  '-f',
  '-frames:v',
  '-t',
  '-ss',
  '-to',
  '-crf',
  '-preset',
  '-pix_fmt',
  '-movflags',
])

export function mimeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

export function isPreviewablePath(filePath: string): boolean {
  return PREVIEW_EXTENSIONS.has(extname(filePath).toLowerCase())
}

export function resolveWorkspacePath(workspace: string, relative: string): string | null {
  const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '')
  const full = resolve(workspace, normalized)
  const workspaceResolved = resolve(workspace)
  if (!full.startsWith(workspaceResolved + '/') && full !== workspaceResolved) {
    return null
  }
  return full
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function extractOutputCandidates(args: string[]): string[] {
  const candidates: string[] = []
  let skipNext = false

  for (const arg of args) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (arg.startsWith('-')) {
      if (FLAG_TAKES_VALUE.has(arg)) skipNext = true
      continue
    }
    if (isPreviewablePath(arg)) {
      candidates.push(arg.replace(/\\/g, '/'))
    }
  }

  return [...new Set(candidates)]
}

export async function collectExistingOutputs(
  workspace: string,
  args: string[],
): Promise<Array<{ relativePath: string; fileName: string; mimeType: string; size: number }>> {
  const results: Array<{
    relativePath: string
    fileName: string
    mimeType: string
    size: number
  }> = []

  for (const relative of extractOutputCandidates(args)) {
    const full = resolveWorkspacePath(workspace, relative)
    if (!full) continue

    try {
      const info = await stat(full)
      if (!info.isFile() || info.size === 0) continue
      results.push({
        relativePath: relative,
        fileName: basename(relative),
        mimeType: mimeFromPath(relative),
        size: info.size,
      })
    } catch {
      // file not created
    }
  }

  return results
}

export type MediaProbeResult = {
  kind: 'image' | 'video'
  width: number
  height: number
  duration?: number
}

export async function probeMediaFile(filePath: string): Promise<MediaProbeResult | null> {
  const mime = mimeFromPath(filePath)
  const isVideo = mime.startsWith('video/')

  return new Promise((resolve) => {
    const args = isVideo
      ? [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height',
          '-show_entries',
          'format=duration',
          '-of',
          'json',
          filePath,
        ]
      : [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height',
          '-of',
          'json',
          filePath,
        ]

    const proc = spawn('ffprobe', args)
    let out = ''

    proc.stdout.on('data', (chunk) => {
      out += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }

      try {
        const parsed = JSON.parse(out) as {
          streams?: Array<{ width?: number; height?: number }>
          format?: { duration?: string }
        }
        const stream = parsed.streams?.[0]
        const width = stream?.width ?? 0
        const height = stream?.height ?? 0
        if (width <= 0 || height <= 0) {
          resolve(null)
          return
        }

        resolve({
          kind: isVideo ? 'video' : 'image',
          width,
          height,
          duration: isVideo ? Number(parsed.format?.duration ?? 0) : undefined,
        })
      } catch {
        resolve(null)
      }
    })

    proc.on('error', () => resolve(null))
  })
}
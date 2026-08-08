const API_BASE = '/api'

export type UploadResponse = {
  id: string
  fileName: string
  path: string
  mimeType: string
  duration?: number
  frameRate?: number
}

export type PresetId = 'upscale' | 'slideshow' | 'extract-frames'

export type ExtractFrameMode = 'all' | 'unique' | 'fps'

export type PresetOptions = {
  mode?: ExtractFrameMode
  /** Only used when mode is `fps`. Ignored for `all` and `unique`. */
  fps?: number
}

export type HealthResponse = {
  ok: boolean
  ffmpeg: { ok: boolean; version?: string; error?: string }
  realesrgan?: { ok: boolean; path?: string; error?: string }
}

export type OutputFileInfo = {
  relativePath: string
  fileName: string
  mimeType: string
  size: number
}

export type WorkspaceMediaInfo = {
  relativePath: string
  fileName: string
  mimeType: string
  size: number
  kind: 'image' | 'video'
  naturalWidth: number
  naturalHeight: number
  duration?: number
  frameRate?: number
  url: string
}

export type StreamEvent =
  | { type: 'meta'; data: string }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'output'; data: string }
  | { type: 'exit'; data: string }

export function workspaceServeUrl(relativePath: string, cacheBust = true): string {
  const params = new URLSearchParams({ path: relativePath })
  if (cacheBust) params.set('t', String(Date.now()))
  return `${API_BASE}/workspace/serve?${params}`
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error('Server unreachable')
  return res.json() as Promise<HealthResponse>
}

/** 8 MiB chunks stay well under Bun's per-request buffering limits. */
const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024

async function readUploadError(res: Response): Promise<string> {
  const err = (await res.json().catch(() => ({}))) as { error?: string }
  if (err.error) return err.error
  if (res.status === 413) return 'Upload failed (413): file too large for server limit'
  return `Upload failed (${res.status})`
}

/**
 * Upload a file in small chunks. Single-shot / multipart bodies are buffered
 * by Bun and fail (or OOM) for large videos; chunked writes stay memory-safe.
 */
export async function uploadFile(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<UploadResponse> {
  const initRes = await fetch(`${API_BASE}/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || undefined,
      size: file.size,
    }),
  })
  if (!initRes.ok) throw new Error(await readUploadError(initRes))

  const { id } = (await initRes.json()) as { id: string }
  if (!id) throw new Error('Upload init returned no id')

  const total = Math.max(file.size, 1)
  onProgress?.(0)

  let offset = 0
  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_SIZE, file.size)
    const chunk = file.slice(offset, end)
    const chunkRes = await fetch(
      `${API_BASE}/upload/chunk?id=${encodeURIComponent(id)}&offset=${offset}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk,
      },
    )
    if (!chunkRes.ok) throw new Error(await readUploadError(chunkRes))
    offset = end
    onProgress?.(Math.min(1, offset / total))
  }

  // Empty file edge case: init created the file; complete still finalizes.
  const completeRes = await fetch(`${API_BASE}/upload/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!completeRes.ok) throw new Error(await readUploadError(completeRes))

  onProgress?.(1)
  return completeRes.json() as Promise<UploadResponse>
}

export async function fetchWorkspaceMediaInfo(
  relativePath: string,
): Promise<WorkspaceMediaInfo> {
  const params = new URLSearchParams({ path: relativePath })
  const res = await fetch(`${API_BASE}/workspace/info?${params}`)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Failed to load output info')
  }
  return res.json() as Promise<WorkspaceMediaInfo>
}

export async function runFfmpegCommand(
  command: string,
  inputPaths: string[],
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<{ exitCode: number; outputs: OutputFileInfo[] }> {
  const res = await fetch(`${API_BASE}/ffmpeg/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, inputPaths }),
    signal,
  })

  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Failed to run command')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let exitCode = 1
  const outputs: OutputFileInfo[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const line = chunk.trim()
      if (!line.startsWith('data: ')) continue
      const event = JSON.parse(line.slice(6)) as StreamEvent
      onEvent(event)
      if (event.type === 'exit') {
        exitCode = Number(event.data)
      }
      if (event.type === 'output') {
        outputs.push(JSON.parse(event.data) as OutputFileInfo)
      }
    }
  }

  return { exitCode, outputs }
}

export async function runPreset(
  presetId: PresetId,
  inputPaths: string[],
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
  options?: PresetOptions,
): Promise<{ exitCode: number; outputs: OutputFileInfo[] }> {
  const res = await fetch(`${API_BASE}/preset/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset: presetId,
      inputPaths,
      ...(options ? { options } : {}),
    }),
    signal,
  })

  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Failed to run preset')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let exitCode = 1
  const outputs: OutputFileInfo[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const line = chunk.trim()
      if (!line.startsWith('data: ')) continue
      const event = JSON.parse(line.slice(6)) as StreamEvent
      onEvent(event)
      if (event.type === 'exit') {
        exitCode = Number(event.data)
      }
      if (event.type === 'output') {
        outputs.push(JSON.parse(event.data) as OutputFileInfo)
      }
    }
  }

  return { exitCode, outputs }
}
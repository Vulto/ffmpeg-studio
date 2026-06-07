const API_BASE = '/api'

export type UploadResponse = {
  id: string
  fileName: string
  path: string
  mimeType: string
}

export type PresetId = 'upscale' | 'slideshow' | 'extract-frames'

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

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Upload failed')
  }

  return res.json() as Promise<UploadResponse>
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
): Promise<{ exitCode: number; outputs: OutputFileInfo[] }> {
  const res = await fetch(`${API_BASE}/preset/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset: presetId, inputPaths }),
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
import { mkdir, open, readdir, stat, unlink } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  checkRealesrgan,
  normalizePresetInputPaths,
  runPreset,
  type PresetId,
  type PresetOptions,
} from './presets'
import {
  collectExistingOutputs,
  fileExists,
  mimeFromPath,
  probeMediaFile,
  resolveWorkspacePath,
} from './workspace'

const PORT = Number(process.env.PORT ?? 4317)
const ROOT = resolve(import.meta.dir, '..')
const WORKSPACE = join(ROOT, '.workspace')
const UPLOADS = join(WORKSPACE, 'uploads')
const OUTPUTS = join(WORKSPACE, 'outputs')

type UploadRecord = {
  id: string
  fileName: string
  path: string
  mimeType: string
}

type PendingUpload = {
  id: string
  fileName: string
  mimeType: string
  path: string
  expectedSize: number
  received: number
  createdAt: number
}

const uploads = new Map<string, UploadRecord>()
const pendingUploads = new Map<string, PendingUpload>()

/** Drop incomplete chunked uploads older than 2 hours. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000

async function ensureDirs() {
  await mkdir(UPLOADS, { recursive: true })
  await mkdir(OUTPUTS, { recursive: true })
}

function corsHeaders(origin?: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, X-File-Name, X-File-Type, X-Upload-Id, X-Chunk-Offset',
  }
}

function safeUploadName(name: string): string {
  return basename(name).replace(/[^\w.\-]+/g, '_') || 'upload.bin'
}

function purgeStalePending() {
  const now = Date.now()
  for (const [id, pending] of pendingUploads) {
    if (now - pending.createdAt > PENDING_TTL_MS) {
      pendingUploads.delete(id)
      void unlink(pending.path).catch(() => {})
    }
  }
}

function json(data: unknown, status = 200, origin?: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  })
}

function isAllowedCommand(command: string): boolean {
  const trimmed = command.trim()
  return /^(ffmpeg|ffprobe)\b/.test(trimmed)
}

function substitutePaths(command: string, paths: string[]): string {
  let result = command
  for (let i = 0; i < paths.length; i++) {
    const quoted = `"${paths[i]}"`
    result = result.replaceAll(`{{${i}}}`, quoted)
  }
  result = result.replaceAll('{{input}}', paths[0] ? `"${paths[0]}"` : '')
  return result
}

async function checkFfmpeg(): Promise<{ ok: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'])
    let out = ''
    proc.stdout.on('data', (chunk) => {
      out += chunk.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, version: out.split('\n')[0]?.trim() })
      } else {
        resolve({ ok: false, error: 'ffmpeg not available' })
      }
    })
    proc.on('error', () => resolve({ ok: false, error: 'ffmpeg not found on PATH' }))
  })
}

await ensureDirs()

// Keep in sync with client MAX_UPLOAD_BYTES (src/lib/media.ts). Override with UPLOAD_MAX_BYTES.
const UPLOAD_MAX_BYTES = Number(
  process.env.UPLOAD_MAX_BYTES ?? 100 * 1024 * 1024,
)

const server = Bun.serve({
  port: PORT,
  maxRequestBodySize: UPLOAD_MAX_BYTES,
  idleTimeout: 255, // seconds; long uploads over LAN/Wi‑Fi
  async fetch(req) {
    const url = new URL(req.url)
    const origin = req.headers.get('origin')

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (url.pathname === '/api/health' && req.method === 'GET') {
      const [ffmpeg, realesrgan] = await Promise.all([checkFfmpeg(), checkRealesrgan()])
      return json({ ok: true, ffmpeg, realesrgan }, 200, origin)
    }

    if (url.pathname === '/api/preset/run' && req.method === 'POST') {
      const body = (await req.json()) as {
        preset?: PresetId
        inputPaths?: string[]
        options?: PresetOptions
      }

      const preset = body.preset
      if (!preset || !['upscale', 'slideshow', 'extract-frames'].includes(preset)) {
        return json({ error: 'Invalid preset' }, 400, origin)
      }

      const inputPaths = normalizePresetInputPaths(WORKSPACE, body.inputPaths ?? [])
      const options = body.options
      const jobId = randomUUID()

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          let closed = false

          const send = (type: string, data: string) => {
            if (closed) return
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
          }

          send('meta', `job ${jobId}`)

          void runPreset(preset, inputPaths, WORKSPACE, (event) => {
            send(event.type, event.data)
          }, options)
            .then(({ exitCode }) => {
              if (!closed) {
                send('exit', String(exitCode))
                closed = true
                controller.close()
              }
            })
            .catch((err) => {
              send('stderr', `${err instanceof Error ? err.message : 'unknown error'}\n`)
              if (!closed) {
                send('exit', '1')
                closed = true
                controller.close()
              }
            })
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...corsHeaders(origin),
        },
      })
    }

    // --- Chunked upload (required for large videos; Bun buffers single-shot bodies) ---

    if (url.pathname === '/api/upload/init' && req.method === 'POST') {
      purgeStalePending()
      try {
        const body = (await req.json()) as {
          fileName?: string
          mimeType?: string
          size?: number
        }
        const fileName = body.fileName?.trim()
        if (!fileName) {
          return json({ error: 'Missing fileName' }, 400, origin)
        }
        const size = Number(body.size ?? 0)
        if (!Number.isFinite(size) || size < 0) {
          return json({ error: 'Invalid size' }, 400, origin)
        }
        if (size > UPLOAD_MAX_BYTES) {
          return json(
            {
              error: `File too large (max ${Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))} MB)`,
            },
            413,
            origin,
          )
        }

        const id = randomUUID()
        const mimeType =
          (body.mimeType && body.mimeType !== 'application/octet-stream'
            ? body.mimeType
            : null) || mimeFromPath(fileName)
        const filePath = join(UPLOADS, `${id}_${safeUploadName(fileName)}`)

        // Pre-create empty file for random-access chunk writes.
        const handle = await open(filePath, 'w')
        await handle.close()

        pendingUploads.set(id, {
          id,
          fileName,
          mimeType,
          path: filePath,
          expectedSize: size,
          received: 0,
          createdAt: Date.now(),
        })

        return json({ id, path: filePath }, 200, origin)
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : 'Init failed' },
          500,
          origin,
        )
      }
    }

    if (url.pathname === '/api/upload/chunk' && req.method === 'POST') {
      try {
        const id = url.searchParams.get('id') || req.headers.get('x-upload-id')
        const offsetRaw =
          url.searchParams.get('offset') || req.headers.get('x-chunk-offset')
        if (!id) return json({ error: 'Missing upload id' }, 400, origin)

        const pending = pendingUploads.get(id)
        if (!pending) {
          return json({ error: 'Unknown or expired upload id' }, 404, origin)
        }

        const offset = Number(offsetRaw ?? 0)
        if (!Number.isFinite(offset) || offset < 0) {
          return json({ error: 'Invalid offset' }, 400, origin)
        }

        const buffer = Buffer.from(await req.arrayBuffer())
        if (buffer.byteLength === 0) {
          return json({ error: 'Empty chunk' }, 400, origin)
        }

        if (
          pending.expectedSize > 0 &&
          offset + buffer.byteLength > pending.expectedSize
        ) {
          return json({ error: 'Chunk exceeds declared file size' }, 400, origin)
        }

        const handle = await open(pending.path, 'r+')
        try {
          await handle.write(buffer, 0, buffer.byteLength, offset)
        } finally {
          await handle.close()
        }

        pending.received = Math.max(pending.received, offset + buffer.byteLength)
        return json(
          { id, offset, written: buffer.byteLength, received: pending.received },
          200,
          origin,
        )
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : 'Chunk write failed' },
          500,
          origin,
        )
      }
    }

    if (url.pathname === '/api/upload/complete' && req.method === 'POST') {
      try {
        const body = (await req.json().catch(() => ({}))) as { id?: string }
        const id = body.id || url.searchParams.get('id')
        if (!id) return json({ error: 'Missing upload id' }, 400, origin)

        const pending = pendingUploads.get(id)
        if (!pending) {
          return json({ error: 'Unknown or expired upload id' }, 404, origin)
        }

        const written = await stat(pending.path).catch(() => null)
        if (!written || !written.isFile()) {
          pendingUploads.delete(id)
          return json({ error: 'Upload file missing on disk' }, 500, origin)
        }

        if (pending.expectedSize > 0 && written.size !== pending.expectedSize) {
          return json(
            {
              error: `Incomplete upload (got ${written.size} of ${pending.expectedSize} bytes)`,
            },
            400,
            origin,
          )
        }

        if (written.size === 0) {
          return json({ error: 'Upload wrote empty file' }, 500, origin)
        }

        pendingUploads.delete(id)
        const record: UploadRecord = {
          id: pending.id,
          fileName: pending.fileName,
          path: pending.path,
          mimeType: pending.mimeType,
        }
        uploads.set(id, record)

        const probe = await probeMediaFile(pending.path)

        return json(
          {
            id: record.id,
            fileName: record.fileName,
            path: record.path,
            mimeType: record.mimeType,
            size: written.size,
            duration: probe?.duration,
            frameRate: probe?.frameRate,
          },
          200,
          origin,
        )
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : 'Complete failed' },
          500,
          origin,
        )
      }
    }

    // Single-shot upload kept for small files / curl convenience.
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      try {
        const contentType = req.headers.get('content-type') ?? ''
        const id = randomUUID()
        let fileName: string
        let mimeType: string
        let filePath: string

        if (contentType.includes('multipart/form-data')) {
          const form = await req.formData()
          const file = form.get('file')
          if (!(file instanceof File)) {
            return json({ error: 'Missing file' }, 400, origin)
          }
          fileName = file.name
          mimeType = file.type || mimeFromPath(file.name)
          filePath = join(UPLOADS, `${id}_${safeUploadName(fileName)}`)
          await Bun.write(filePath, file)
        } else {
          const rawName =
            req.headers.get('x-file-name') ||
            url.searchParams.get('name') ||
            'upload.bin'
          try {
            fileName = decodeURIComponent(rawName)
          } catch {
            fileName = rawName
          }
          mimeType =
            req.headers.get('x-file-type') ||
            contentType ||
            mimeFromPath(fileName)
          if (mimeType === 'application/octet-stream') {
            mimeType = mimeFromPath(fileName)
          }
          filePath = join(UPLOADS, `${id}_${safeUploadName(fileName)}`)
          if (!req.body) throw new Error('Empty request body')
          await Bun.write(filePath, new Response(req.body))
        }

        const written = await stat(filePath).catch(() => null)
        if (!written || !written.isFile() || written.size === 0) {
          return json({ error: 'Upload wrote empty file' }, 500, origin)
        }

        const record: UploadRecord = {
          id,
          fileName,
          path: filePath,
          mimeType,
        }
        uploads.set(id, record)

        const probe = await probeMediaFile(filePath)

        return json(
          {
            id: record.id,
            fileName: record.fileName,
            path: record.path,
            mimeType: record.mimeType,
            size: written.size,
            duration: probe?.duration,
            frameRate: probe?.frameRate,
          },
          200,
          origin,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        const tooLarge =
          /body|size|limit|413|too large/i.test(message) ||
          (err as { code?: string })?.code === 'ERR_BODY_TOO_LARGE'
        return json(
          {
            error: tooLarge
              ? `File too large (max ${Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))} MB)`
              : message,
          },
          tooLarge ? 413 : 500,
          origin,
        )
      }
    }

    if (url.pathname === '/api/files' && req.method === 'GET') {
      const files = [...uploads.values()].map(({ id, fileName, path, mimeType }) => ({
        id,
        fileName,
        path,
        mimeType,
      }))
      return json({ files }, 200, origin)
    }

    if (url.pathname === '/api/workspace/serve' && req.method === 'GET') {
      const relative = url.searchParams.get('path')
      if (!relative) {
        return json({ error: 'Missing path' }, 400, origin)
      }

      const full = resolveWorkspacePath(WORKSPACE, relative)
      if (!full || !(await fileExists(full))) {
        return json({ error: 'File not found' }, 404, origin)
      }

      const file = Bun.file(full)
      return new Response(file, {
        headers: {
          'Content-Type': mimeFromPath(full),
          'Cache-Control': 'no-cache',
          ...corsHeaders(origin),
        },
      })
    }

    if (url.pathname === '/api/workspace/info' && req.method === 'GET') {
      const relative = url.searchParams.get('path')
      if (!relative) {
        return json({ error: 'Missing path' }, 400, origin)
      }

      const full = resolveWorkspacePath(WORKSPACE, relative)
      if (!full || !(await fileExists(full))) {
        return json({ error: 'File not found' }, 404, origin)
      }

      const info = await stat(full)
      const probe = await probeMediaFile(full)
      if (!probe) {
        return json({ error: 'Could not probe media' }, 422, origin)
      }

      return json(
        {
          relativePath: relative.replace(/\\/g, '/'),
          fileName: basename(relative),
          mimeType: mimeFromPath(full),
          size: info.size,
          kind: probe.kind,
          naturalWidth: probe.width,
          naturalHeight: probe.height,
          duration: probe.duration,
          frameRate: probe.frameRate,
          url: `/api/workspace/serve?path=${encodeURIComponent(relative)}`,
        },
        200,
        origin,
      )
    }

    if (url.pathname === '/api/ffmpeg/run' && req.method === 'POST') {
      const body = (await req.json()) as {
        command?: string
        inputPaths?: string[]
      }

      const command = body.command?.trim()
      if (!command) {
        return json({ error: 'Missing command' }, 400, origin)
      }

      if (!isAllowedCommand(command)) {
        return json({ error: 'Only ffmpeg and ffprobe commands are allowed' }, 400, origin)
      }

      const inputPaths = normalizeInputPaths(body.inputPaths ?? [])
      const resolved = substitutePaths(command, inputPaths)
      const jobId = randomUUID()
      const [bin, ...args] = parseCommand(resolved)
      const isFfmpeg = bin === 'ffmpeg'

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          let closed = false

          const send = (type: string, data: string) => {
            if (closed) return
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
          }

          const finish = async (exit: number) => {
            if (closed) return

            proc.stdout.removeAllListeners('data')
            proc.stderr.removeAllListeners('data')

            if (exit === 0 && isFfmpeg) {
              const outputs = await collectExistingOutputs(WORKSPACE, args)
              for (const output of outputs) {
                send('output', JSON.stringify(output))
              }
            }

            send('exit', String(exit))
            closed = true
            controller.close()
          }

          send('meta', `$ ${resolved}`)
          send('meta', `job ${jobId}`)

          const proc = spawn(bin, args, {
            cwd: WORKSPACE,
            shell: false,
          })

          proc.stdout.on('data', (chunk) => send('stdout', chunk.toString()))
          proc.stderr.on('data', (chunk) => send('stderr', chunk.toString()))

          proc.on('close', (code) => {
            void finish(code ?? 1)
          })

          proc.on('error', (err) => {
            send('stderr', `${err.message}\n`)
            void finish(1)
          })
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...corsHeaders(origin),
        },
      })
    }

    if (url.pathname === '/api/workspace/outputs' && req.method === 'GET') {
      const entries = await readdir(OUTPUTS).catch(() => [] as string[])
      const files = []
      for (const name of entries) {
        const filePath = join(OUTPUTS, name)
        const info = await stat(filePath)
        if (info.isFile()) {
          files.push({ name, path: filePath, size: info.size })
        }
      }
      return json({ files }, 200, origin)
    }

    return json({ error: 'Not found' }, 404, origin)
  },
})

console.log(`ffmpeg-studio server http://localhost:${server.port}`)

function normalizeInputPaths(paths: string[]): string[] {
  return paths.map((p) => {
    if (p.startsWith('/')) return p
    const resolved = resolveWorkspacePath(WORKSPACE, p)
    return resolved ?? p
  })
}

function parseCommand(command: string): [string, ...string[]] {
  const parts: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === ' ') {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current) parts.push(current)

  const [bin, ...args] = parts
  return [bin, ...args]
}
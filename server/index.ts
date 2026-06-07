import { mkdir, readdir, stat } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  checkRealesrgan,
  normalizePresetInputPaths,
  runPreset,
  type PresetId,
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

const uploads = new Map<string, UploadRecord>()

async function ensureDirs() {
  await mkdir(UPLOADS, { recursive: true })
  await mkdir(OUTPUTS, { recursive: true })
}

function corsHeaders(origin?: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

const server = Bun.serve({
  port: PORT,
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
      }

      const preset = body.preset
      if (!preset || !['upscale', 'slideshow', 'extract-frames'].includes(preset)) {
        return json({ error: 'Invalid preset' }, 400, origin)
      }

      const inputPaths = normalizePresetInputPaths(WORKSPACE, body.inputPaths ?? [])
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
          })
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

    if (url.pathname === '/api/upload' && req.method === 'POST') {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return json({ error: 'Missing file' }, 400, origin)
      }

      const id = randomUUID()
      const safeName = basename(file.name).replace(/[^\w.\-]+/g, '_')
      const diskName = `${id}_${safeName}`
      const filePath = join(UPLOADS, diskName)
      const buffer = Buffer.from(await file.arrayBuffer())
      await Bun.write(filePath, buffer)

      const record: UploadRecord = {
        id,
        fileName: file.name,
        path: filePath,
        mimeType: file.type,
      }
      uploads.set(id, record)

      return json(
        {
          id: record.id,
          fileName: record.fileName,
          path: record.path,
          mimeType: record.mimeType,
        },
        200,
        origin,
      )
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
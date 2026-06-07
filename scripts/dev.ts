const root = import.meta.dir + '/..'
const port = Number(process.env.PORT ?? 4317)

async function portInUse(p: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${p}/api/health`)
    return res.ok
  } catch {
    return false
  }
}

if (await portInUse(port)) {
  console.warn(`API already running on :${port} — starting Vite only`)
  const vite = Bun.spawn(['bunx', 'vite', '--host'], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  })
  process.on('SIGINT', () => {
    vite.kill()
    process.exit(0)
  })
  await vite.exited
  process.exit(0)
}

const server = Bun.spawn(['bun', 'server/index.ts'], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
})

const vite = Bun.spawn(['bunx', 'vite', '--host'], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
})

const shutdown = (code = 0) => {
  if (!server.killed) server.kill()
  if (!vite.killed) vite.kill()
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const [serverExit, viteExit] = await Promise.all([server.exited, vite.exited])
console.error(`Process exited (server=${serverExit}, vite=${viteExit})`)
shutdown(serverExit || viteExit || 1)
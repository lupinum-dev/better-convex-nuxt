import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'

interface LocalConvexHandle {
  process: ChildProcessWithoutNullStreams
  url: string
  port: number
}

let activeHandle: LocalConvexHandle | null = null
let retainers = 0

function deriveSiteUrlFromConvexUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString)
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port) {
      const port = Number.parseInt(url.port, 10)
      if (!Number.isNaN(port)) {
        url.port = String(port + 1)
        return url.toString().replace(/\/$/, '')
      }
    }
    return null
  } catch {
    return null
  }
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now()

  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('timeout', () => {
        socket.destroy()
        retry()
      })
      socket.once('error', () => {
        socket.destroy()
        retry()
      })
      socket.connect(port, '127.0.0.1')
    }

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for local Convex backend on port ${port}`))
        return
      }
      setTimeout(check, 100)
    }

    check()
  })
}

export async function ensureLocalConvex(
  options: { port?: number, cwd?: string, timeoutMs?: number } = {},
): Promise<{ env: Record<string, string>, release: () => Promise<void> }> {
  const explicitUrl = process.env.CONVEX_URL
  if (explicitUrl) {
    const explicitSiteUrl = process.env.CONVEX_SITE_URL ?? deriveSiteUrlFromConvexUrl(explicitUrl)
    return {
      env: {
        CONVEX_URL: explicitUrl,
        ...(explicitSiteUrl ? { CONVEX_SITE_URL: explicitSiteUrl } : {}),
        ALLOW_TEST_RESET: process.env.ALLOW_TEST_RESET ?? 'true',
      },
      release: async () => {},
    }
  }

  const port = options.port ?? 3214
  const timeoutMs = options.timeoutMs ?? 25_000
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'playground')
  const url = `http://127.0.0.1:${port}`

  if (!activeHandle) {
    const child = spawn('npx', ['convex', 'dev', '--local'], {
      cwd,
      env: {
        ...process.env,
        CONVEX_LOCAL_BACKEND_PORT: String(port),
      },
      stdio: 'pipe',
    })

    child.stdout.on('data', () => {})
    child.stderr.on('data', () => {})

    child.once('exit', (code) => {
      if (code !== null && code !== 0 && activeHandle?.process === child) {
        activeHandle = null
      }
    })

    activeHandle = {
      process: child,
      url,
      port,
    }

    await waitForPort(port, timeoutMs)
  }

  retainers += 1

  const release = async () => {
    retainers -= 1
    if (retainers > 0) return
    if (!activeHandle) return

    const child = activeHandle.process
    activeHandle = null
    child.kill('SIGTERM')

    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }, 3000)

    await once(child, 'exit').catch(() => {})
    clearTimeout(timer)
  }

  return {
    env: {
      CONVEX_URL: activeHandle.url,
      CONVEX_SITE_URL: `http://127.0.0.1:${activeHandle.port + 1}`,
      ALLOW_TEST_RESET: 'true',
    },
    release,
  }
}

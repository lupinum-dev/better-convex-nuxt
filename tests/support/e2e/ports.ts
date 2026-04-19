import { spawn } from 'node:child_process'
import net from 'node:net'

export function waitForPort(port: number, timeoutMs: number): Promise<void> {
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
        reject(new Error(`Timed out waiting for port ${port}`))
        return
      }
      setTimeout(check, 100)
    }

    check()
  })
}

export function waitForPortClosed(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now()

  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.once('connect', () => {
        socket.destroy()
        retry()
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        resolve()
      })
      socket.connect(port, '127.0.0.1')
    }

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for port ${port} to close`))
        return
      }
      setTimeout(check, 100)
    }

    check()
  })
}

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not determine free port')))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function listListeningPids(port: number): Promise<number[]> {
  return await new Promise((resolve) => {
    const child = spawn('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    let stdout = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.once('error', () => resolve([]))
    child.once('close', () => {
      const pids = stdout
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => !Number.isNaN(value))
      resolve(pids)
    })
  })
}

export async function terminateListeningPorts(ports: number[]): Promise<void> {
  for (const port of ports) {
    const pids = await listListeningPids(port)
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch (error) {
        void error
      }
    }
  }

  for (const port of ports) {
    try {
      await waitForPortClosed(port, 5_000)
    } catch {
      const pids = await listListeningPids(port)
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch (error) {
          void error
        }
      }
      await waitForPortClosed(port, 5_000).catch(() => {})
    }
  }
}

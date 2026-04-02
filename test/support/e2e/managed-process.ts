import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000
const MAX_CAPTURED_LINES = 120

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function appendCapturedLines(target: string[], chunk: Buffer | string): void {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (!line) continue
    target.push(line)
  }

  if (target.length > MAX_CAPTURED_LINES) {
    target.splice(0, target.length - MAX_CAPTURED_LINES)
  }
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ')
}

function formatLogs(stdoutLines: string[], stderrLines: string[]): string {
  const sections = []

  if (stdoutLines.length > 0) {
    sections.push(['stdout:', ...stdoutLines].join('\n'))
  }

  if (stderrLines.length > 0) {
    sections.push(['stderr:', ...stderrLines].join('\n'))
  }

  return sections.join('\n\n')
}

export interface SpawnManagedProcessOptions {
  args: string[]
  command: string
  cwd: string
  env: NodeJS.ProcessEnv
  name: string
}

export interface ManagedProcessHandle {
  createFailure: (message: string, cause?: unknown) => Error
  process: ChildProcessWithoutNullStreams
  stop: (graceMs?: number) => Promise<void>
  unexpectedExit: Promise<never>
}

export function spawnManagedProcess(options: SpawnManagedProcessOptions): ManagedProcessHandle {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'pipe',
  })

  const stdoutLines: string[] = []
  const stderrLines: string[] = []
  let expectedShutdown = false

  child.stdout.on('data', (chunk) => appendCapturedLines(stdoutLines, chunk))
  child.stderr.on('data', (chunk) => appendCapturedLines(stderrLines, chunk))

  const exitPromise = once(child, 'exit').then(([code, signal]) => ({
    code,
    signal: signal ?? null,
  }))

  const createFailure = (message: string, cause?: unknown): Error => {
    const logs = formatLogs(stdoutLines, stderrLines)
    const details = [message, `command: ${formatCommand(options.command, options.args)}`]

    if (cause instanceof Error) {
      details.push(`cause: ${cause.message}`)
    } else if (cause) {
      details.push(`cause: ${String(cause)}`)
    }

    if (logs) {
      details.push(logs)
    }

    return new Error(details.join('\n\n'))
  }

  const unexpectedExit = exitPromise.then(({ code, signal }) => {
    if (expectedShutdown) {
      return new Promise<never>(() => {})
    }

    const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
    throw createFailure(`${options.name} exited unexpectedly (${detail}).`)
  })

  const stop = async (graceMs = DEFAULT_SHUTDOWN_TIMEOUT_MS): Promise<void> => {
    if (child.exitCode !== null || child.killed) {
      await exitPromise.catch(() => {})
      return
    }

    expectedShutdown = true
    child.kill('SIGTERM')

    await Promise.race([
      exitPromise,
      sleep(graceMs).then(() => {
        if (child.exitCode === null && !child.killed) {
          child.kill('SIGKILL')
        }
      }),
    ])

    await exitPromise.catch(() => {})
  }

  return {
    createFailure,
    process: child,
    stop,
    unexpectedExit,
  }
}

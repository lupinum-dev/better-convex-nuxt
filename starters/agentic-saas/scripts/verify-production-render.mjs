import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const starterDirectory = fileURLToPath(new URL('..', import.meta.url))
const outputEntry = fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))
const host = '127.0.0.1'
const timeoutMs = 20_000

async function reservePort() {
  const server = createServer()
  server.unref()
  server.listen(0, host)
  await once(server, 'listening')

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not reserve a production smoke-test port')
  }

  const { port } = address
  server.close()
  await once(server, 'close')
  return port
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const port = await reservePort()
const output = []
const server = spawn(process.execPath, [outputEntry], {
  cwd: starterDirectory,
  env: {
    ...process.env,
    HOST: host,
    NITRO_HOST: host,
    NITRO_PORT: String(port),
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => output.push(chunk))
}

const deadline = Date.now() + timeoutMs
let response

try {
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited with code ${server.exitCode}`)
    }

    try {
      response = await fetch(`http://${host}:${port}/`, {
        signal: AbortSignal.timeout(2_000),
      })
      break
    } catch {
      await wait(100)
    }
  }

  if (!response) {
    throw new Error(`Production server did not accept requests within ${timeoutMs}ms`)
  }

  const html = await response.text()
  if (response.status !== 200) {
    throw new Error(`Production root returned HTTP ${response.status}: ${html.slice(0, 500)}`)
  }
  if (!html.includes('Agentic SaaS') || !html.includes('Approval Queue')) {
    throw new Error('Production root did not render the Agentic SaaS approval queue')
  }

  console.log(
    `Production root render passed: HTTP ${response.status}, Agentic SaaS / Approval Queue`,
  )
} catch (error) {
  const logs = output.join('').trim()
  if (logs) console.error(logs)
  throw error
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([once(server, 'exit'), wait(2_000)])
    if (server.exitCode === null) server.kill('SIGKILL')
  }
}

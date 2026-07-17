import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'

const rootUrl = process.env.STARTER_BROWSER_URL ?? 'http://127.0.0.1:3000'
const convexCloudPort = Number(process.env.STARTER_CONVEX_CLOUD_PORT ?? 3210)
const convexSitePort = Number(process.env.STARTER_CONVEX_SITE_PORT ?? 3211)
const nuxtPort = Number(new URL(rootUrl).port || 80)
const defaultAuthSecrets = '0:mcp-agent-browser-smoke-secret-local-only-32chars'
const defaultMcpServerSecret = 'mcp-agent-local-test-server-secret-1234'
const browserViewport = process.argv.includes('--mobile')
  ? 'mobile'
  : (process.env.STARTER_BROWSER_VIEWPORT ?? 'desktop')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const processes = []

function stripAnsi(value) {
  return stripVTControlCharacters(value)
}

function log(name, chunk) {
  const text = stripAnsi(String(chunk))
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) console.log(`[${name}] ${line}`)
  }
}

async function assertPortFree(port, label) {
  await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', () => {
      reject(new Error(`${label} port ${port} is already in use`))
    })
    server.once('listening', () => {
      server.close(resolve)
    })
    server.listen(port, '127.0.0.1')
  })
}

function startProcess(name, args, readyPattern, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_AUTH_SECRETS: process.env.BETTER_AUTH_SECRETS ?? defaultAuthSecrets,
        MCP_SERVER_SECRET: process.env.MCP_SERVER_SECRET ?? defaultMcpServerSecret,
        SITE_URL: rootUrl,
        VITE_CONVEX_URL: `http://127.0.0.1:${convexCloudPort}`,
        VITE_CONVEX_SITE_URL: `http://127.0.0.1:${convexSitePort}`,
        NUXT_PUBLIC_CONVEX_URL: `http://127.0.0.1:${convexCloudPort}`,
        NUXT_PUBLIC_CONVEX_SITE_URL: `http://127.0.0.1:${convexSitePort}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    processes.push(child)
    let output = ''
    let ready = false

    const timer = setTimeout(() => {
      if (ready) return
      reject(new Error(`${name} did not become ready within ${timeoutMs}ms\n${output}`))
    }, timeoutMs)

    function onData(chunk) {
      const text = stripAnsi(String(chunk))
      output += text
      log(name, text)
      if (/Would you like to link it now\?/.test(text)) {
        child.stdin.write('n\n')
      }
      if (!ready && readyPattern.test(output)) {
        ready = true
        clearTimeout(timer)
        resolve(child)
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (!ready) reject(new Error(`${name} exited before ready with code ${code}\n${output}`))
    })
  })
}

function runProcess(name, args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCP_SERVER_SECRET: process.env.MCP_SERVER_SECRET ?? defaultMcpServerSecret,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${name} did not finish within ${timeoutMs}ms\n${output}`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      output += stripAnsi(String(chunk))
      log(name, chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += stripAnsi(String(chunk))
      log(name, chunk)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(output)
      } else {
        reject(new Error(`${name} exited with code ${code}\n${output}`))
      }
    })
  })
}

async function stopProcesses() {
  await Promise.all(
    processes.reverse().map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode) {
            resolve()
            return
          }
          const timer = setTimeout(() => {
            child.kill('SIGTERM')
            resolve()
          }, 2_000)
          child.once('exit', () => {
            clearTimeout(timer)
            resolve()
          })
          child.kill('SIGINT')
        }),
    ),
  )
}

async function readConvexDeploymentRef() {
  const envText = await readFile('.env.local', 'utf8')
  const match = envText.match(/^CONVEX_DEPLOYMENT=(.+)$/m)
  if (!match?.[1]) {
    throw new Error('CONVEX_DEPLOYMENT was not written to .env.local')
  }

  return match[1].trim()
}

async function configureConvexMcpEnv() {
  const deployment = await readConvexDeploymentRef()
  await runProcess('convex-env', [
    'exec',
    'convex',
    'env',
    'set',
    '--deployment',
    deployment,
    'SITE_URL',
    rootUrl,
  ])
  await runProcess('convex-env', [
    'exec',
    'convex',
    'env',
    'set',
    '--deployment',
    deployment,
    'BETTER_AUTH_SECRETS',
    process.env.BETTER_AUTH_SECRETS ?? defaultAuthSecrets,
  ])
  await runProcess('convex-env', [
    'exec',
    'convex',
    'env',
    'set',
    '--deployment',
    deployment,
    'MCP_SERVER_SECRET',
    process.env.MCP_SERVER_SECRET ?? defaultMcpServerSecret,
  ])
}

function getBrowserContextOptions() {
  if (browserViewport !== 'mobile') return {}

  return {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }
}

async function clickTestId(page, testId, label) {
  const locator = page.getByTestId(testId)
  await locator.waitFor({ state: 'visible', timeout: 30_000 })
  await waitForEnabled(locator, label)
  await locator.click()
}

async function fillTestId(page, testId, value) {
  const locator = page.getByTestId(testId)
  await locator.waitFor({ state: 'visible', timeout: 30_000 })
  await locator.click()
  await locator.fill(value)
  const actual = await locator.inputValue()
  if (actual !== value) {
    throw new Error(
      `${testId} value was not filled. Expected "${redactDebugValue(testId, value)}", saw "${redactDebugValue(testId, actual)}"`,
    )
  }
}

async function waitForEnabled(locator, label, timeoutMs = 15_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await locator.isEnabled().catch(() => false)) return
    await delay(100)
  }

  throw new Error(`${label} was not enabled within ${timeoutMs}ms`)
}

async function waitForText(page, text, timeoutMs = 30_000) {
  await page.waitForFunction((expected) => document.body.textContent?.includes(expected), text, {
    timeout: timeoutMs,
  })
}

async function expectTestIdHidden(page, testId) {
  const count = await page.getByTestId(testId).count()
  if (count !== 0) {
    throw new Error(`${testId} should not be visible`)
  }
}

async function callMcpTool(bearerToken, name, args) {
  const client = new Client({
    name: 'mcp-agent-browser-verifier',
    version: '0.1.0',
  })

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', rootUrl), {
        requestInit: {
          headers: {
            authorization: `Bearer ${bearerToken}`,
          },
        },
      }),
    )

    const result = await client.callTool({
      name,
      arguments: args,
    })
    const content = Array.isArray(result.content) ? result.content : []
    const text = content
      .filter((item) => item && typeof item === 'object' && item.type === 'text')
      .map((item) => item.text)
    if (result.isError) {
      throw new Error(text[0] ?? `${name} failed`)
    }

    return text
  } finally {
    await client.close()
  }
}

function parseMcpJson(text, toolName) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${toolName} returned non-JSON content: ${text}`)
  }
}

function redactDebugValue(testId, value) {
  if (value === undefined) return undefined
  if (/password|secret|token|bearer|credential|hash|server/i.test(testId ?? '')) {
    return '[redacted]'
  }
  return value
}

function isAllowedAuthToken401Console(message, allowAuthToken401) {
  if (!allowAuthToken401) return false
  if (
    !message.text().includes('Failed to load resource: the server responded with a status of 401')
  ) {
    return false
  }

  const locationUrl = message.location().url
  if (!locationUrl) return false

  try {
    return new URL(locationUrl).pathname === '/api/auth/convex/token'
  } catch {
    return false
  }
}

async function readPageDebug(page, failures) {
  const debug = await page.evaluate(() => ({
    url: location.href,
    text: document.body.textContent?.replace(/\s+/g, ' ').slice(0, 2_000) ?? '',
    testIds: Array.from(document.querySelectorAll('[data-testid]')).map((element) => ({
      id: element.getAttribute('data-testid'),
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '',
      rawValue: element instanceof HTMLInputElement ? element.value : undefined,
      disabled: element instanceof HTMLButtonElement ? element.disabled : undefined,
    })),
  }))
  const redactedTestIds = debug.testIds.map((entry) => ({
    ...entry,
    rawValue: undefined,
    value: redactDebugValue(entry.id, entry.rawValue),
  }))

  return [
    `URL: ${debug.url}`,
    `Visible text: ${debug.text}`,
    `Test ids: ${JSON.stringify(redactedTestIds, null, 2)}`,
    failures.length ? `Captured failures:\n${failures.join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function runBrowserHappyPath() {
  const browser = await chromium.launch()
  const context = await browser.newContext(getBrowserContextOptions())
  const page = await context.newPage()
  const failures = []
  let allowAuthToken401 = true

  page.on('pageerror', (error) => {
    failures.push(`page error: ${error.message}`)
  })
  page.on('console', (message) => {
    if (isAllowedAuthToken401Console(message, allowAuthToken401)) return
    if (['error', 'warning'].includes(message.type())) {
      failures.push(`console ${message.type()}: ${message.text()}`)
    }
  })
  page.on('response', (response) => {
    if (
      response.status() === 401 &&
      new URL(response.url()).pathname === '/api/auth/convex/token' &&
      allowAuthToken401
    ) {
      return
    }
    if (response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()}`)
    }
  })

  const stamp = Date.now()
  const name = `MCP Browser Owner ${stamp}`
  const email = `mcp-browser-${stamp}@example.com`
  const password = `McpBrowser-${stamp}!`
  const organizationName = `MCP Browser Org ${stamp}`
  const humanProjectName = `Human Project ${stamp}`
  const serviceActorName = `Browser Agent ${stamp}`
  const mcpProjectName = `MCP Project ${stamp}`

  try {
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'MCP agent starter' }).waitFor({ timeout: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 })
    await delay(500)

    await fillTestId(page, 'auth-name', name)
    await fillTestId(page, 'auth-email', email)
    await fillTestId(page, 'auth-password', 'short')
    if (await page.getByTestId('auth-submit').isEnabled()) {
      throw new Error('Auth submit should be disabled for a too-short password')
    }
    await fillTestId(page, 'auth-password', password)
    await clickTestId(page, 'auth-submit', 'Create account button')

    await page.getByTestId('auth-name').waitFor({ state: 'detached', timeout: 40_000 })
    await waitForEnabled(
      page.getByTestId('auth-submit'),
      'Sign in after account creation button',
      40_000,
    )
    await fillTestId(page, 'auth-password', password)
    await clickTestId(page, 'auth-submit', 'Sign in after account creation button')
    await page.getByTestId('sign-out').waitFor({ state: 'visible', timeout: 40_000 })
    allowAuthToken401 = false
    await waitForText(page, 'No organization yet')

    await fillTestId(page, 'org-name', '   ')
    await clickTestId(page, 'create-org', 'Create organization button')
    await page.getByTestId('action-error').waitFor({ state: 'visible', timeout: 20_000 })
    await waitForText(page, 'Organization name is required')

    await fillTestId(page, 'org-name', organizationName)
    await clickTestId(page, 'create-org', 'Create organization button')
    await waitForText(page, 'Organization created')
    await page.getByTestId('action-error').waitFor({ state: 'detached', timeout: 20_000 })
    await waitForText(page, organizationName)

    await fillTestId(page, 'human-project-name', '   ')
    await clickTestId(page, 'create-human-project', 'Create human project button')
    await page.getByTestId('action-error').waitFor({ state: 'visible', timeout: 20_000 })
    await waitForText(page, 'Project name is required')

    await fillTestId(page, 'human-project-name', humanProjectName)
    await clickTestId(page, 'create-human-project', 'Create human project button')
    await waitForText(page, 'Human project created through Convex')
    await page.getByTestId('action-error').waitFor({ state: 'detached', timeout: 20_000 })
    await waitForText(page, humanProjectName)
    await waitForText(page, 'human')

    await fillTestId(page, 'service-actor-name', '   ')
    await clickTestId(page, 'create-service-actor', 'Create service actor button')
    await page.getByTestId('action-error').waitFor({ state: 'visible', timeout: 20_000 })
    await waitForText(page, 'Service actor name is required')

    await fillTestId(page, 'service-actor-name', serviceActorName)
    await page.getByTestId('service-actor-role').selectOption('admin')
    await clickTestId(page, 'create-service-actor', 'Create service actor button')
    await waitForText(page, 'Service actor credential created')
    await page.getByTestId('action-error').waitFor({ state: 'detached', timeout: 20_000 })
    await waitForText(page, serviceActorName)
    const secret = await page.getByTestId('service-actor-secret').inputValue()
    if (!/^[a-f0-9]{64}$/.test(secret)) {
      throw new Error('Server-minted bearer secret was not a 64-character hex token')
    }

    await fillTestId(page, 'mcp-project-name', '   ')
    await clickTestId(page, 'create-mcp-project', 'Create MCP project button')
    await page.getByTestId('action-error').waitFor({ state: 'visible', timeout: 20_000 })
    await waitForText(page, 'Project name is required')

    await fillTestId(page, 'mcp-project-name', mcpProjectName)
    await clickTestId(page, 'create-mcp-project', 'Create MCP project button')
    await waitForText(page, 'Created project')
    await page.getByTestId('action-error').waitFor({ state: 'detached', timeout: 20_000 })
    await waitForText(page, mcpProjectName)
    await waitForText(page, 'service actor')

    const listedProjectsText = await callMcpTool(secret, 'projects.list', {})
    const listedProjects = parseMcpJson(listedProjectsText[0] ?? '[]', 'projects.list')
    const mcpProject = listedProjects.find((project) => project.name === mcpProjectName)
    if (!mcpProject?.id) {
      throw new Error('MCP-created project was not returned by projects.list')
    }

    const previewText = await callMcpTool(secret, 'projects.delete.preview', {
      projectId: mcpProject.id,
    })
    const preview = parseMcpJson(previewText[0] ?? '{}', 'projects.delete.preview')
    if (preview.status !== 'ready' || preview.requiresApproval !== true) {
      throw new Error('projects.delete.preview did not require approval')
    }

    const approvalRequestText = await callMcpTool(secret, 'projects.delete.requestApproval', {
      projectId: mcpProject.id,
      reason: 'Browser verifier requested project deletion through MCP.',
      requestKey: `browser-${stamp}-delete-${mcpProject.id}`,
    })
    const approvalRequest = parseMcpJson(
      approvalRequestText[0] ?? '{}',
      'projects.delete.requestApproval',
    )
    if (approvalRequest.status !== 'waiting_for_approval' || !approvalRequest.approvalRequestId) {
      throw new Error('projects.delete.requestApproval did not create a pending approval')
    }

    await waitForText(page, 'Pending approvals')
    await waitForText(page, mcpProjectName)
    await clickTestId(
      page,
      `approve-approval-${approvalRequest.approvalRequestId}`,
      'Approve MCP delete request button',
    )
    await waitForText(page, 'Approval granted')

    const approvalStatusText = await callMcpTool(secret, 'approvals.get', {
      approvalRequestId: approvalRequest.approvalRequestId,
    })
    const approvalStatus = parseMcpJson(approvalStatusText[0] ?? '{}', 'approvals.get')
    if (approvalStatus.status !== 'approved') {
      throw new Error('approvals.get did not report approved status')
    }

    const deleteText = await callMcpTool(secret, 'projects.delete.execute', {
      projectId: mcpProject.id,
      approvalId: approvalRequest.approvalRequestId,
    })
    const deleteResult = parseMcpJson(deleteText[0] ?? '{}', 'projects.delete.execute')
    if (deleteResult.status !== 'executed') {
      throw new Error('projects.delete.execute did not execute after approval')
    }
    await waitForText(page, 'No pending approvals')
    await page.waitForFunction(
      (deletedProjectName) => !document.body.textContent?.includes(deletedProjectName),
      mcpProjectName,
      { timeout: 30_000 },
    )

    await clickTestId(page, 'sign-out', 'Sign out button')
    allowAuthToken401 = true
    await page.getByTestId('auth-form').waitFor({ state: 'visible', timeout: 30_000 })

    await page.getByRole('button', { name: 'Sign in' }).click()
    await expectTestIdHidden(page, 'auth-name')
    await waitForText(page, 'Sign in')
    await fillTestId(page, 'auth-email', email)
    await fillTestId(page, 'auth-password', password)
    await clickTestId(page, 'auth-submit', 'Sign in button')
    await page.getByTestId('sign-out').waitFor({ state: 'visible', timeout: 40_000 })
    allowAuthToken401 = false
    await waitForText(page, organizationName)

    await clickTestId(page, 'sign-out', 'Sign out button')
    allowAuthToken401 = true
    await page.getByTestId('auth-form').waitFor({ state: 'visible', timeout: 30_000 })

    if (failures.length) {
      throw new Error(`Browser smoke saw unexpected failures:\n${failures.join('\n')}`)
    }

    console.log(`MCP browser happy path passed (${browserViewport})`)
  } catch (error) {
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        await readPageDebug(page, failures),
      ].join('\n\n'),
      { cause: error },
    )
  } finally {
    await context.close()
    await browser.close()
  }
}

async function main() {
  await assertPortFree(nuxtPort, 'Nuxt')
  await assertPortFree(convexCloudPort, 'Convex cloud')
  await assertPortFree(convexSitePort, 'Convex site')

  try {
    await startProcess(
      'convex',
      ['exec', 'convex', 'dev', '--tail-logs', 'disable'],
      /Convex functions ready/,
      90_000,
    )
    await configureConvexMcpEnv()
    await startProcess(
      'nuxt',
      ['exec', 'nuxt', 'dev', '--host', '127.0.0.1', '--port', String(nuxtPort)],
      /Local:\s+http:\/\/127\.0\.0\.1:/,
      60_000,
    )
    await delay(3_000)
    await runBrowserHappyPath()
  } finally {
    await stopProcesses()
  }
}

main().catch(async (error) => {
  await stopProcesses()
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

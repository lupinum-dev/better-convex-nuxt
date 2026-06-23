import { spawn } from 'node:child_process'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'

const rootUrl = process.env.STARTER_BROWSER_URL ?? 'http://localhost:3000'
const convexCloudPort = Number(process.env.STARTER_CONVEX_CLOUD_PORT ?? 3210)
const convexSitePort = Number(process.env.STARTER_CONVEX_SITE_PORT ?? 3211)
const nuxtPort = Number(new URL(rootUrl).port || 80)
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const processes = []

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
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
        SITE_URL: rootUrl,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'starter-browser-smoke-secret',
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

async function submitNamedForm(page, placeholder, value) {
  const form = page
    .locator('form')
    .filter({ has: page.getByPlaceholder(placeholder) })
    .last()
  await form.getByPlaceholder(placeholder).fill(value)
  await form.getByRole('button', { name: 'Create' }).click()
}

async function waitForEnabled(locator, label, timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await locator.isEnabled().catch(() => false)) return
    await delay(100)
  }

  throw new Error(`${label} was not enabled within ${timeoutMs}ms`)
}

async function submitSignUpForm(page, args) {
  const form = page.locator('form.auth-form')
  const submit = form.getByRole('button', { name: 'Create account' })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await form.waitFor({ state: 'visible', timeout: 20_000 })
    await form.getByPlaceholder('Your name').fill(args.name)
    await form.getByPlaceholder('you@example.com').fill(args.email)
    await form.getByPlaceholder('Min 8 characters').fill(args.password)

    try {
      await waitForEnabled(submit, 'Create account button', 5_000)
      await submit.click()
      return
    } catch (error) {
      if (attempt === 2) throw error
      await delay(500)
    }
  }
}

async function visibleProjectRow(page, name) {
  const projects = page.getByLabel('Projects')
  const row = projects.locator('li').filter({ hasText: name }).first()
  await row.waitFor({ state: 'visible', timeout: 20_000 })
  return row
}

async function runBrowserHappyPath() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  const failures = []

  page.on('pageerror', (error) => {
    failures.push(`page error: ${error.message}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 500) {
      failures.push(`${response.status()} ${response.url()}`)
    }
  })

  const stamp = Date.now()
  const name = `Browser User ${stamp}`
  const email = `starter-browser-${stamp}@example.com`
  const password = `Starter-${stamp}!`
  const organizationName = `Browser Org ${stamp}`
  const teamName = `Product Team ${stamp}`
  const projectName = `Launch Plan ${stamp}`
  const renamedProjectName = `Launch Plan Renamed ${stamp}`

  try {
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Organizations' }).waitFor({ timeout: 20_000 })
    await submitSignUpForm(page, { name, email, password })

    await page.getByPlaceholder('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
    await submitNamedForm(page, 'Organization name', organizationName)

    const orgLink = page.getByRole('link', { name: new RegExp(organizationName) })
    await orgLink.waitFor({ state: 'visible', timeout: 30_000 })
    await orgLink.click()

    await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Create team' }).waitFor({ timeout: 20_000 })
    await submitNamedForm(page, 'Team name', teamName)

    await page.getByPlaceholder('Project name').waitFor({ state: 'visible', timeout: 30_000 })
    await submitNamedForm(page, 'Project name', projectName)

    let row = await visibleProjectRow(page, projectName)
    await row.getByRole('button', { name: 'Rename' }).click()
    const renameForm = page
      .getByLabel('Projects')
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Save' }) })
    await renameForm.locator('input').fill(renamedProjectName)
    await renameForm.getByRole('button', { name: 'Save' }).click()

    row = await visibleProjectRow(page, renamedProjectName)
    await row.getByRole('button', { name: 'Delete' }).click()
    await row.waitFor({ state: 'detached', timeout: 20_000 })

    await page.getByRole('button', { name: 'Deleted' }).click()
    row = await visibleProjectRow(page, renamedProjectName)
    await row.getByRole('button', { name: 'Restore' }).click()
    await row.waitFor({ state: 'detached', timeout: 20_000 })

    await page.getByRole('button', { name: 'Active' }).click()
    await visibleProjectRow(page, renamedProjectName)

    if (failures.length) {
      throw new Error(`Browser smoke saw unexpected failures:\n${failures.join('\n')}`)
    }

    console.log('Browser happy path passed')
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

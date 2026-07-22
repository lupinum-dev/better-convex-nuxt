#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from 'playwright'

const repositoryRoot = resolve(import.meta.dirname, '..')
const packageRoot = join(repositoryRoot, 'packages/vue')
const fixtureRoot = join(repositoryRoot, 'test/fixtures/vue-authenticated')
const scratchRoot = mkdtempSync(join(tmpdir(), 'better-convex-vue-auth-'))
const consumerRoot = join(scratchRoot, 'consumer')
const tokenSentinel = `proof-${crypto.randomUUID()}`
const providerErrorSentinel = `provider-${crypto.randomUUID()}`

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' })
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolvePromise) => server.close(resolvePromise))
  if (!port) throw new Error('Failed to reserve a preview port')
  return port
}

async function waitForPreview(url, child) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite preview exited with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  throw new Error('Timed out waiting for the authenticated Vue preview')
}

function assertSnapshot(snapshot, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (snapshot[key] !== value) {
      throw new Error(
        `Snapshot ${key} expected ${JSON.stringify(value)}; received ${JSON.stringify(snapshot[key])}`,
      )
    }
  }
  const serialized = JSON.stringify(snapshot)
  if (serialized.includes(tokenSentinel) || serialized.includes(providerErrorSentinel)) {
    throw new Error('Safe identity snapshot disclosed provider-private material')
  }
  if (Object.hasOwn(snapshot, 'token') || Object.hasOwn(snapshot, 'role')) {
    throw new Error('Safe identity snapshot gained credential or policy fields')
  }
}

let preview = null
let browser = null
try {
  run('pnpm', ['run', 'build'], packageRoot)
  const packResult = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratchRoot], {
      cwd: packageRoot,
      encoding: 'utf8',
    }),
  )
  if (!Array.isArray(packResult) || packResult.length !== 1 || !packResult[0]?.filename) {
    throw new Error('Vue package pack must produce exactly one tarball')
  }

  cpSync(fixtureRoot, consumerRoot, { recursive: true })
  cpSync(join(scratchRoot, packResult[0].filename), join(consumerRoot, 'better-convex-vue.tgz'))
  run('pnpm', ['install', '--frozen-lockfile=false', '--ignore-scripts'], consumerRoot)
  run('pnpm', ['run', 'typecheck'], consumerRoot)
  run('pnpm', ['run', 'build'], consumerRoot)
  const assetsDirectory = join(consumerRoot, 'dist/assets')
  const bundleName = readdirSync(assetsDirectory).find(
    (name) => name.startsWith('index-') && name.endsWith('.js'),
  )
  if (!bundleName) throw new Error('Authenticated consumer emitted no JavaScript entry bundle')
  const bundleBytes = readFileSync(join(assetsDirectory, bundleName), 'utf8')
  for (const marker of [tokenSentinel, providerErrorSentinel, 'better-auth', '@better-auth/']) {
    if (bundleBytes.includes(marker)) {
      throw new Error(`Authenticated bundle contains forbidden marker: ${marker}`)
    }
  }

  const port = await reservePort()
  const url = `http://127.0.0.1:${port}`
  preview = spawn(
    'pnpm',
    ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: consumerRoot,
      stdio: 'ignore',
    },
  )
  await waitForPreview(url, preview)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })

  const invoke = (method, ...args) =>
    page.evaluate(
      ({ methodName, methodArgs }) => window.__betterConvexAuthProof[methodName](...methodArgs),
      { methodName: method, methodArgs: args },
    )
  assertSnapshot(await invoke('snapshot'), {
    authEnabled: true,
    settled: false,
    identityKey: 'anonymous',
    identityGeneration: 0,
  })
  assertSnapshot(await invoke('transition', 'anonymous', null, 1), {
    settled: true,
    identityKey: 'anonymous',
    identityGeneration: 1,
  })
  assertSnapshot(await invoke('transition', 'authenticated', 'alice', 2, tokenSentinel), {
    settled: true,
    identityKey: 'user:alice',
    identityGeneration: 2,
  })
  const beforeProviderRefresh = await invoke('stats')
  assertSnapshot(await invoke('transition', 'authenticated', 'alice', 2, tokenSentinel), {
    settled: true,
    identityKey: 'user:alice',
    identityGeneration: 2,
  })
  const afterProviderRefresh = await invoke('stats')
  if (afterProviderRefresh.tokenFetches !== beforeProviderRefresh.tokenFetches + 1) {
    throw new Error('Same-session provider notification did not refresh exactly once')
  }
  const beforeRefresh = await invoke('stats')
  assertSnapshot(await invoke('refresh'), {
    settled: true,
    identityKey: 'user:alice',
    identityGeneration: 2,
  })
  const afterRefresh = await invoke('stats')
  if (afterRefresh.tokenFetches !== beforeRefresh.tokenFetches + 1) {
    throw new Error('Explicit refresh did not fetch exactly one new token')
  }
  assertSnapshot(await invoke('transition', 'authenticated', 'alice', 3, tokenSentinel), {
    settled: true,
    identityKey: 'user:alice',
    identityGeneration: 3,
  })
  assertSnapshot(await invoke('transition', 'authenticated', 'bob', 4, tokenSentinel), {
    settled: true,
    identityKey: 'user:bob',
    identityGeneration: 4,
  })
  assertSnapshot(await invoke('rejectCurrent'), {
    settled: true,
    identityKey: 'anonymous',
    identityGeneration: 5,
  })
  assertSnapshot(await invoke('transition', 'authenticated', 'carol', 6, tokenSentinel), {
    settled: true,
    identityKey: 'user:carol',
    identityGeneration: 6,
  })
  assertSnapshot(await invoke('transition', 'anonymous', null, 7), {
    settled: true,
    identityKey: 'anonymous',
    identityGeneration: 7,
  })
  assertSnapshot(await invoke('transition', 'error', null, 8, providerErrorSentinel), {
    settled: true,
    identityKey: 'anonymous',
    identityGeneration: 8,
  })

  const attachmentKeys = await invoke('attachmentKeys')
  if (
    JSON.stringify(attachmentKeys) !==
    JSON.stringify(['anonymousClient', 'client', 'connection', 'identity'])
  ) {
    throw new Error(`Unexpected attachment surface: ${JSON.stringify(attachmentKeys)}`)
  }
  const clientKeys = await invoke('clientKeys')
  if (JSON.stringify(clientKeys) !== JSON.stringify(['action', 'mutation', 'onUpdate', 'query'])) {
    throw new Error(`Stable client handle gained lifecycle controls: ${JSON.stringify(clientKeys)}`)
  }
  const body = await page.locator('body').textContent()
  if (body.includes(tokenSentinel) || body.includes(providerErrorSentinel)) {
    throw new Error('Credential or provider error entered rendered output')
  }
  const disposed = await invoke('unmount')
  if (disposed.listeners !== 0 || disposed.closed < 1) {
    throw new Error(`Authenticated consumer did not dispose cleanly: ${JSON.stringify(disposed)}`)
  }

  console.log('Authenticated packed Vue consumer passed.')
} finally {
  await browser?.close()
  if (preview && preview.exitCode === null) preview.kill('SIGTERM')
  rmSync(scratchRoot, { recursive: true, force: true })
}

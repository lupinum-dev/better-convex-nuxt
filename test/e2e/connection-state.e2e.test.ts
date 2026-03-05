import { fileURLToPath } from 'node:url'

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

import { ensureLocalConvex } from '../helpers/local-convex'

let local: Awaited<ReturnType<typeof ensureLocalConvex>> | null = null
try {
  local = await ensureLocalConvex({
    cwd: fileURLToPath(new URL('../../playground', import.meta.url)),
  })
} catch (error) {
  console.warn('[e2e] Skipping connection-state suite: local Convex backend unavailable.', error)
}

const maybeDescribe = local ? describe : describe.skip

maybeDescribe('Connection state (full stack)', async () => {
  afterAll(async () => {
    if (local) {
      await local.release()
    }
  })

  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    env: local?.env,
  })

  it('renders connection telemetry with expected state shape', async () => {
    const page = await createPage('/labs/connection')
    await page.waitForSelector('.raw-state pre', { timeout: 15000 })

    const heading = await page.textContent('.container h1')
    expect(heading).toContain('Connection Lab')

    const webSocketConnected = await page.textContent(
      '.stat:has(.label:text("WebSocket Connected")) .value',
    )
    expect(webSocketConnected).toMatch(/Yes|No/)

    const rawState = await page.textContent('.raw-state pre')
    const parsed = JSON.parse(rawState || '{}')
    expect(parsed).toHaveProperty('hasInflightRequests')
    expect(parsed).toHaveProperty('isWebSocketConnected')
    expect(parsed).toHaveProperty('connectionRetries')
  })
})

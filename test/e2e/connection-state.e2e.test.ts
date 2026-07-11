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
  console.warn(
    `[e2e] Skipping connection-state suite: ${error instanceof Error ? error.message : String(error)}`,
  )
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
    nuxtConfig: local
      ? {
          convex: {
            url: local.env.NUXT_PUBLIC_CONVEX_URL,
            siteUrl: local.env.NUXT_PUBLIC_CONVEX_SITE_URL,
          },
        }
      : undefined,
  })

  it('renders connection telemetry with expected state shape', async () => {
    const page = await createPage('/')
    await page.waitForLoadState('networkidle')
    const hydrationDiagnostics: string[] = []
    page.on('console', (message) => {
      const text = message.text()
      if (/hydration.*mismatch/i.test(text)) {
        hydrationDiagnostics.push(text)
      }
    })
    await page.goto(`${new URL(page.url()).origin}/labs/connection`)
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
    expect(hydrationDiagnostics).toEqual([])
  })
})

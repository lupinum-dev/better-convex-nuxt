import { setup, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('plugin.server dev misconfig overlay', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    dev: true,
    port: 3000,
    nuxtConfig: {
      devtools: { enabled: false },
    },
    env: {
      CONVEX_URL: 'https://demo.convex.cloud',
      CONVEX_SITE_URL: 'http://127.0.0.1:1',
    },
  })

  it('renders a visible SSR error page when token exchange fails in dev', async () => {
    const page = await createPage('/labs/guard-open')
    const origin = new URL(page.url()).origin

    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: 'e2e-session-token',
        url: origin,
      },
    ])

    const response = await page.goto(`${origin}/labs/guard-open?force_misconfig=1`, {
      waitUntil: 'domcontentloaded',
    })

    expect(response?.status()).toBe(500)

    const body = await page.textContent('body')
    expect(body || '').toContain('NuxtConvexError')
    expect(body || '').toMatch(/token exchange failed/i)
  })
})

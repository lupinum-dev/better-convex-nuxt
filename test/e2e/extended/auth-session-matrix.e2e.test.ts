import { fileURLToPath } from 'node:url'

import { createPage, setup } from '@nuxt/test-utils/e2e'
import { chromium, type Page } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'

import { assertLocalAuthReady, ensureLocalConvex } from '../../helpers/local-convex'

const playgroundCwd = fileURLToPath(new URL('../../../playground', import.meta.url))
const local = await ensureLocalConvex({ cwd: playgroundCwd })
await assertLocalAuthReady({ cwd: playgroundCwd, env: local.env, origin: 'http://localhost:3050' })

async function signUp(page: Page, email: string) {
  await page.goto('http://localhost:3050/auth/signup')
  await page.fill('#name', 'Security Matrix User')
  await page.fill('#email', email)
  await page.fill('#password', 'Password123!')
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 15_000 })
}

describe('canonical Better Auth session matrix', async () => {
  afterAll(async () => local.release())

  await setup({
    rootDir: playgroundCwd,
    env: local.env,
    port: 3050,
    nuxtConfig: {
      convex: {
        url: local.env.NUXT_PUBLIC_CONVEX_URL,
        siteUrl: local.env.NUXT_PUBLIC_CONVEX_SITE_URL,
      },
    },
  })

  it('propagates raw Better Auth logout across tabs and clears Convex identity', async () => {
    const browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()
    const secondPage = await context.newPage()

    try {
      await signUp(page, `raw-logout-${Date.now()}@example.com`)
      await page.goto('http://localhost:3050/labs/use-auth-test')
      await secondPage.goto('http://localhost:3050/labs/use-auth-test')
      await expect.poll(() => page.getByTestId('auth-state').textContent()).toBe('true')
      await expect.poll(() => secondPage.getByTestId('auth-state').textContent()).toBe('true')

      await page.getByTestId('raw-signout').click()
      await expect.poll(() => page.getByTestId('auth-state').textContent()).toBe('false')
      await expect.poll(() => secondPage.getByTestId('auth-state').textContent()).toBe('false')
      await expect.poll(() => secondPage.getByTestId('auth-email').textContent()).toBe('none')
    } finally {
      await browser.close()
    }
  })

  it('replaces the prior account identity after logout and a second signup', async () => {
    const page = await createPage('/')
    const firstEmail = `switch-a-${Date.now()}@example.com`
    const secondEmail = `switch-b-${Date.now()}@example.com`
    await signUp(page, firstEmail)
    await page.goto('http://localhost:3050/labs/use-auth-test')
    await expect.poll(() => page.getByTestId('auth-email').textContent()).toBe(firstEmail)
    await page.getByTestId('raw-signout').click()
    await expect.poll(() => page.getByTestId('auth-state').textContent()).toBe('false')
    await signUp(page, secondEmail)
    await page.goto('http://localhost:3050/labs/use-auth-test')
    await expect.poll(() => page.getByTestId('auth-email').textContent()).toBe(secondEmail)
  })
})

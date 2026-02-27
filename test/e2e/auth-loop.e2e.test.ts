import { setup, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { assertLocalAuthReady, ensureLocalConvex } from '../helpers/local-convex'

const playgroundCwd = fileURLToPath(new URL('../../playground', import.meta.url))

const local = await ensureLocalConvex({
  cwd: playgroundCwd,
})

await assertLocalAuthReady({
  cwd: playgroundCwd,
  env: local.env,
  origin: 'http://localhost:3000',
})

describe('Auth loop (full stack)', async () => {
  afterAll(async () => {
    await local.release()
  })

  await setup({
    rootDir: playgroundCwd,
    env: local.env,
    port: 3000,
  })

  it('completes signup -> authenticated dashboard -> signout -> protected redirect', async () => {
    const page = await createPage('/')
    await page.goto('http://localhost:3000/auth/signup')

    const uniqueEmail = `e2e+${Date.now()}@example.com`

    await page.fill('#name', 'E2E User')
    await page.fill('#email', uniqueEmail)
    await page.fill('#password', 'Password123!')
    await page.click('button[type="submit"]')

    await Promise.race([
      page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 15_000 }),
      page.waitForSelector('.error', { timeout: 15_000 }),
    ]).catch(() => {})

    const postSignupCookies = await page.context().cookies()
    const hasSessionAfterSignup = postSignupCookies.some(cookie =>
      cookie.name === 'better-auth.session_token' || cookie.name === '__Secure-better-auth.session_token',
    )

    if (!hasSessionAfterSignup) {
      const signupError = await page.textContent('.error').catch(() => null)
      throw new Error(`Signup did not establish a session${signupError ? `: ${signupError}` : ''}`)
    }

    await page.goto('http://localhost:3000/demo/dashboard')
    await page.waitForSelector('h2', { timeout: 30_000 })

    const headings = await page.$$eval('h2', nodes => nodes.map(node => node.textContent?.trim() || ''))
    expect(headings).toContain('Your Profile')

    const cookies = await page.context().cookies()
    const hasSessionCookie = cookies.some(cookie =>
      cookie.name === 'better-auth.session_token' || cookie.name === '__Secure-better-auth.session_token',
    )
    expect(hasSessionCookie).toBe(true)

    await page.click('button.btn-signout')
    await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 30_000 })

    await page.goto('http://localhost:3000/labs/guard-protected')
    await page.waitForURL(/\/auth\/signin/, { timeout: 15_000 })

    const redirectUrl = new URL(page.url())
    expect(redirectUrl.pathname).toBe('/auth/signin')
    expect(redirectUrl.searchParams.get('redirect')).toBe('/labs/guard-protected')
  })
})

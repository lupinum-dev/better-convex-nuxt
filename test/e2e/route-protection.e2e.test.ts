import { fileURLToPath } from 'node:url'

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('convexAuth route protection', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  it('does not redirect unprotected pages', async () => {
    const page = await createPage('/labs/guard-open')
    expect(page.url()).toContain('/labs/guard-open')
    expect(await page.textContent('.container h1')).toContain('Guard Open')
  })

  it('redirects protected pages to auth route with redirect param', async () => {
    const page = await createPage('/labs/guard-protected')
    const currentUrl = new URL(page.url())
    expect(currentUrl.pathname).toBe('/auth/signin')
    expect(currentUrl.searchParams.get('redirect')).toBe('/labs/guard-protected')
  })

  it('does not mount protected content while auth is pending before redirecting', async () => {
    const page = await createPage('/labs/guard-pending-control')

    await page.click('[data-testid="start-pending-guard-nav"]')
    await page.waitForURL(/\/auth\/signin/, { timeout: 10000 })

    const currentUrl = new URL(page.url())
    expect(currentUrl.pathname).toBe('/auth/signin')
    expect(currentUrl.searchParams.get('redirect')).toBe('/labs/guard-pending-protected')

    const protectedMountCount = await page.evaluate(() => {
      return (
        (window as Window & { __BCN_PENDING_GUARD_PROTECTED_MOUNTED__?: number })
          .__BCN_PENDING_GUARD_PROTECTED_MOUNTED__ ?? 0
      )
    })
    expect(protectedMountCount).toBe(0)
  })
})

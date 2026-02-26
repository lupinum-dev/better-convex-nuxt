import { setup, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('convexAuth route protection behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  it('does not redirect unprotected pages', async () => {
    const page = await createPage('/labs/guard-open')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/labs/guard-open')
    expect(await page.textContent('.container h1')).toContain('Guard Open')
  }, 30000)

  it('redirects protected pages to default auth route with returnTo', async () => {
    const page = await createPage('/labs/guard-protected')
    await page.waitForLoadState('networkidle')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/auth/signin')
    expect(url.searchParams.get('redirect')).toBe('/labs/guard-protected')
  }, 30000)

  it('uses custom per-page redirect target when provided', async () => {
    const page = await createPage('/labs/guard-custom-redirect')
    await page.waitForLoadState('networkidle')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/auth/signup')
    expect(url.searchParams.get('redirect')).toBe('/labs/guard-custom-redirect')
  }, 30000)
})


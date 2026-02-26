import { setup, $fetch, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

async function openUseAuthTestPage() {
  const page = await createPage('/labs/use-auth-test')
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })
  return { page, pageErrors, consoleErrors }
}

async function waitForSelectorWithDebug(
  page: { waitForSelector: (s: string, o?: { timeout?: number }) => Promise<unknown>; textContent: (s: string) => Promise<string | null>; content: () => Promise<string>; url: () => string },
  selector: string,
  options: { timeout: number },
) {
  try {
    await page.waitForSelector(selector, options)
  } catch (error) {
    const bodyText = await page.textContent('body').catch(() => null)
    const content = await page.content().catch(() => null)
    console.error('[useAuth.behavior] selector wait failed', { selector, url: page.url(), bodyText, contentSnippet: content?.slice(0, 1000) })
    throw error
  }
}

describe('useAuth behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  it('renders on SSR without auth errors', async () => {
    const html = await $fetch('/labs/use-auth-test')
    expect(html).toContain('useAuth Test')
    expect(html).not.toContain('500 Internal Server Error')
  })

  it('hydrates and exposes auth state/action methods on client', async () => {
    const { page, pageErrors, consoleErrors } = await openUseAuthTestPage()
    expect(page.url()).toContain('/labs/use-auth-test')
    await waitForSelectorWithDebug(page, '.panel .row', { timeout: 10000 })

    const panelText = await page.textContent('.panel')
    expect(panelText).toContain('signIn.email type')
    expect(panelText).toContain('function')
    expect(panelText).toContain('signUp.email type')
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  }, 30000)
})

import { setup, $fetch, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('useAuth behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  it('renders on SSR without auth errors', async () => {
    const html = await $fetch('/labs/use-auth-test')
    expect(html).toContain('useAuth Test')
    expect(html).not.toContain('500 Internal Server Error')
  })

  it('exposes auth state and action methods on client', async () => {
    const page = await createPage('/labs/use-auth-test?__stubAuth=1')
    await page.waitForLoadState('networkidle')

    const panelText = await page.textContent('.panel')
    expect(panelText).toContain('signIn.email type')
    expect(panelText).toContain('function')
    expect(panelText).toContain('signUp.email type')
  }, 30000)

  it('can call stubbed signIn and signUp actions without live auth backend', async () => {
    const page = await createPage('/labs/use-auth-test?__stubAuth=1')
    await page.waitForLoadState('networkidle')

    await page.click('.actions .btn:first-of-type')
    await page.waitForFunction(() => {
      const el = document.querySelector('.result')
      return (el?.textContent || '').includes('"kind": "signIn"')
    })
    expect(await page.textContent('.result')).toContain('"kind": "signIn"')

    await page.click('.actions .btn:nth-of-type(2)')
    await page.waitForFunction(() => {
      const el = document.querySelector('.result')
      return (el?.textContent || '').includes('"kind": "signUp"')
    })
    expect(await page.textContent('.result')).toContain('"kind": "signUp"')
  }, 30000)
})


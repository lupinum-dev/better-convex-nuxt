import { afterEach, describe, expect, it } from 'vitest'

import { createAuthHarness } from '../../harness'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

describe('OWASP A01: Broken Access Control (Runtime)', () => {
  it('never treats a token-only state as authenticated', async () => {
    h = await createAuthHarness({
      initialToken: 'invalid.jwt.token',
      initialUser: null,
      initialAuthError: 'Failed to decode auth token',
    })

    expect(h.isAuthenticated.value).toBe(false)
  })

  it('does not allow direct token mutation to bypass user-based auth checks', async () => {
    h = await createAuthHarness()

    h.token.value = 'manually-injected.token'
    await h.flush()

    expect(h.isAuthenticated.value).toBe(false)
    expect(h.isAnonymous.value).toBe(true)
  })
})

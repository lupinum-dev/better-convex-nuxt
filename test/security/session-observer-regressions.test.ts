import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { observeBetterAuthSession } from '../../src/runtime/auth/session-observer'

describe('Better Auth public session observer', () => {
  it('reconciles login, account switch, logout, and errors from public state', async () => {
    const session = ref<{
      data: { session: { id: string } } | null
      isPending: boolean
      error: { message: string } | null
    }>({ data: null, isPending: true, error: null })
    const reconcile = vi.fn()
    const stop = observeBetterAuthSession({ useSession: () => session }, reconcile)
    expect(reconcile).not.toHaveBeenCalled()
    session.value = { data: { session: { id: 'session-a' } }, isPending: false, error: null }
    await nextTick()
    session.value = { data: { session: { id: 'session-b' } }, isPending: false, error: null }
    await nextTick()
    session.value = { data: null, isPending: false, error: null }
    await nextTick()
    session.value = { data: null, isPending: false, error: { message: 'expired' } }
    await nextTick()
    expect(reconcile.mock.calls).toEqual([
      [true, null],
      [true, null],
      [false, null],
      [false, 'expired'],
    ])
    stop()
  })

  it('settles MFA, OAuth callback, expiry, and revocation through session revisions', async () => {
    const session = ref<{
      data: { session: { id: string } } | null
      isPending: boolean
      error: { message: string } | null
    }>({ data: null, isPending: false, error: null })
    const reconcile = vi.fn()
    const stop = observeBetterAuthSession({ useSession: () => session }, reconcile)

    session.value = { data: null, isPending: true, error: null }
    await nextTick()
    session.value = { data: { session: { id: 'mfa-complete' } }, isPending: false, error: null }
    await nextTick()
    session.value = { data: { session: { id: 'oauth-callback' } }, isPending: false, error: null }
    await nextTick()
    session.value = { data: null, isPending: false, error: { message: 'session expired' } }
    await nextTick()
    session.value = { data: null, isPending: false, error: null }
    await nextTick()

    expect(reconcile.mock.calls).toEqual([
      [false, null],
      [true, null],
      [true, null],
      [false, 'session expired'],
      [false, null],
    ])
    stop()
  })
})

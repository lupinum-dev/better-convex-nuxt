import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { observeBetterAuthSession } from '../../src/runtime/auth/session-observer'

describe('Better Auth public session observer', () => {
  it('reconciles login, account switch, logout, and errors from public state', async () => {
    const session = ref<{
      data: { session: { id: string; token: string } } | null
      isPending: boolean
      error: { message: string } | null
    }>({ data: null, isPending: true, error: null })
    const reconcile = vi.fn()
    const stop = observeBetterAuthSession({ useSession: () => session }, reconcile)
    expect(reconcile).not.toHaveBeenCalled()
    session.value = {
      data: { session: { id: 'session-a', token: 'session-token-a' } },
      isPending: false,
      error: null,
    }
    await nextTick()
    session.value = {
      data: { session: { id: 'session-b', token: 'session-token-b' } },
      isPending: false,
      error: null,
    }
    await nextTick()
    session.value = { data: null, isPending: false, error: null }
    await nextTick()
    session.value = { data: null, isPending: false, error: { message: 'expired' } }
    await nextTick()
    expect(reconcile.mock.calls).toEqual([
      ['session-token-a', null],
      ['session-token-b', null],
      [null, null],
      [null, 'expired'],
    ])
    stop()
  })

  it('reconciles one same-token claim revision but ignores refetch-only wrappers', async () => {
    const stableData = {
      session: { id: 'session-a', token: 'session-token-a', activeOrganizationId: 'org-a' },
      user: { id: 'user-a', name: 'Before' },
    }
    const session = ref({
      data: stableData,
      isPending: false,
      isRefetching: false,
      error: null as { message: string } | null,
    })
    const reconcile = vi.fn()
    const stop = observeBetterAuthSession({ useSession: () => session }, reconcile)

    expect(reconcile.mock.calls).toEqual([['session-token-a', null]])

    // Better Auth replaces the outer store projection while retaining the
    // canonical data reference for a JSON-equal refetch. Neither wrapper churn
    // nor isRefetching is a session revision.
    session.value = { ...session.value, isRefetching: true }
    await nextTick()
    session.value = { ...session.value, isRefetching: false }
    await nextTick()
    expect(reconcile).toHaveBeenCalledTimes(1)

    // A changed public data reference is a real revision even when the stable
    // session token is unchanged (for example, an organization or user claim).
    const changedData = {
      session: { ...stableData.session, activeOrganizationId: 'org-b' },
      user: { ...stableData.user, name: 'After' },
    }
    session.value = { ...session.value, data: changedData }
    await nextTick()
    expect(reconcile.mock.calls).toEqual([
      ['session-token-a', null],
      ['session-token-a', null],
    ])

    session.value = { ...session.value }
    await nextTick()
    expect(reconcile).toHaveBeenCalledTimes(2)
    stop()
  })

  it('settles MFA, OAuth callback, expiry, and revocation through session revisions', async () => {
    const session = ref<{
      data: { session: { id: string; token: string } } | null
      isPending: boolean
      error: { message: string } | null
    }>({ data: null, isPending: false, error: null })
    const reconcile = vi.fn()
    const stop = observeBetterAuthSession({ useSession: () => session }, reconcile)

    session.value = { data: null, isPending: true, error: null }
    await nextTick()
    session.value = {
      data: { session: { id: 'mfa-complete', token: 'mfa-session-token' } },
      isPending: false,
      error: null,
    }
    await nextTick()
    session.value = {
      data: { session: { id: 'oauth-callback', token: 'oauth-session-token' } },
      isPending: false,
      error: null,
    }
    await nextTick()
    session.value = { data: null, isPending: false, error: { message: 'session expired' } }
    await nextTick()
    session.value = { data: null, isPending: false, error: null }
    await nextTick()

    expect(reconcile.mock.calls).toEqual([
      [null, null],
      ['mfa-session-token', null],
      ['oauth-session-token', null],
      [null, 'session expired'],
      [null, null],
    ])
    stop()
  })
})

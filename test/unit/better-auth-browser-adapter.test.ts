import { inspect } from 'node:util'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createBetterAuthBrowserAdapter } from '../../src/runtime/auth/better-auth-browser-adapter'

interface SessionState {
  data?: {
    session?: { token?: unknown }
    user?: { id?: unknown }
  } | null
  isPending?: boolean
  error?: unknown
}

function jwt(sub: string, expiresInSeconds = 3_600) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ sub, exp: Math.floor(Date.now() / 1_000) + expiresInSeconds })}.signature`
}

function source(
  initial: SessionState,
  responses: Array<{ data?: { token: string | null } | null; error?: unknown }>,
) {
  const session = ref<SessionState>(initial)
  const token = vi.fn(async () => responses.shift() ?? { data: null, error: null })
  return {
    session,
    token,
    client: {
      useSession: () => session,
      convex: { token },
    },
  }
}

describe('Better Auth browser adapter', () => {
  it('uses the same session parser for identity and reconciliation', () => {
    const stableData = {
      session: { token: 'session-a' },
      user: { id: 'alice' },
    }
    const fixture = source({ isPending: true, data: null, error: null }, [])
    const sessionChanged = vi.fn()
    const adapter = createBetterAuthBrowserAdapter(fixture.client, {
      authenticated: vi.fn(),
      anonymous: vi.fn(),
      sessionChanged,
    })

    expect(sessionChanged).not.toHaveBeenCalled()
    fixture.session.value = { isPending: false, data: stableData, error: null }
    expect(sessionChanged.mock.calls).toEqual([['session-a', null]])
    expect(adapter.snapshot()).toMatchObject({
      status: 'authenticated',
      identityKey: 'alice',
    })

    fixture.session.value = { ...fixture.session.value }
    expect(sessionChanged).toHaveBeenCalledTimes(1)

    fixture.session.value = {
      ...fixture.session.value,
      data: {
        session: stableData.session,
        user: { ...stableData.user },
      },
    }
    expect(sessionChanged.mock.calls).toEqual([
      ['session-a', null],
      ['session-a', null],
    ])

    fixture.session.value = { isPending: false, data: null, error: null }
    expect(sessionChanged).toHaveBeenLastCalledWith(null, null)
    adapter.dispose()
  })

  it('derives only a stable key and generation from public session state', () => {
    const fixture = source(
      {
        isPending: true,
        data: null,
        error: null,
      },
      [],
    )
    const adapter = createBetterAuthBrowserAdapter(fixture.client)
    expect(adapter.snapshot()).toMatchObject({
      status: 'loading',
      sessionGeneration: 0,
    })

    fixture.session.value = {
      isPending: false,
      data: {
        session: { token: 'better-auth-session-secret' },
        user: { id: 'alice' },
      },
      error: null,
    }
    expect(adapter.snapshot()).toMatchObject({
      status: 'authenticated',
      identityKey: 'alice',
      sessionGeneration: 1,
    })
    expect(JSON.stringify(adapter.snapshot())).not.toContain('session-secret')

    // A JSON-equal session observation is not a new credential lifecycle.
    fixture.session.value = { ...fixture.session.value }
    expect(adapter.snapshot().sessionGeneration).toBe(1)

    fixture.session.value = {
      isPending: false,
      data: {
        session: { token: 'better-auth-replacement-session-secret' },
        user: { id: 'alice' },
      },
      error: null,
    }
    expect(adapter.snapshot().sessionGeneration).toBe(2)

    fixture.session.value = { isPending: false, data: null, error: null }
    expect(adapter.snapshot()).toMatchObject({
      status: 'anonymous',
      identityKey: null,
      sessionGeneration: 3,
    })
    adapter.dispose()
  })

  it('returns only a matching short-lived Convex identity token', async () => {
    const aliceToken = jwt('alice')
    const fixture = source(
      {
        isPending: false,
        data: { session: { token: 'session-a' }, user: { id: 'alice' } },
        error: null,
      },
      [{ data: { token: aliceToken }, error: null }],
    )
    const adapter = createBetterAuthBrowserAdapter(fixture.client)
    await expect(adapter.fetchToken({ forceRefreshToken: false })).resolves.toBe(aliceToken)
    expect(JSON.stringify(adapter.snapshot())).not.toContain(aliceToken)
    adapter.dispose()
  })

  it('rejects a token whose subject disagrees with the observed session user', async () => {
    const fixture = source(
      {
        isPending: false,
        data: { session: { token: 'session-a' }, user: { id: 'alice' } },
        error: null,
      },
      [{ data: { token: jwt('bob') }, error: null }],
    )
    const adapter = createBetterAuthBrowserAdapter(fixture.client)
    await expect(adapter.fetchToken({ forceRefreshToken: false })).resolves.toBeNull()
    adapter.dispose()
  })

  it('fails malformed/error session state closed and disposes observation once', () => {
    const fixture = source(
      {
        isPending: false,
        data: { session: { token: 'session-secret' }, user: {} },
        error: null,
      },
      [],
    )
    const adapter = createBetterAuthBrowserAdapter(fixture.client)
    const listener = vi.fn()
    adapter.subscribe(listener)
    expect(adapter.snapshot()).toMatchObject({
      status: 'error',
      identityKey: null,
    })
    expect(JSON.stringify(adapter.snapshot())).not.toContain('session-secret')

    adapter.dispose()
    adapter.dispose()
    fixture.session.value = { isPending: false, data: null, error: null }
    expect(listener).not.toHaveBeenCalled()
  })

  it('never forwards a raw Better Auth error through session reconciliation', () => {
    const sentinels = {
      message: 'SESSION_MESSAGE_SENTINEL_723e6a',
      cause: 'SESSION_CAUSE_SENTINEL_a52b11',
      stack: 'SESSION_STACK_SENTINEL_0c418f',
    }
    const error = new Error(sentinels.message, {
      cause: new Error(sentinels.cause),
    })
    error.stack = sentinels.stack
    const fixture = source({ isPending: false, data: null, error }, [])
    const sessionChanged = vi.fn()
    const adapter = createBetterAuthBrowserAdapter(fixture.client, {
      authenticated: vi.fn(),
      anonymous: vi.fn(),
      sessionChanged,
    })

    expect(sessionChanged).toHaveBeenCalledWith(null, 'Authentication is temporarily unavailable')
    const rendered = inspect(sessionChanged.mock.calls, { depth: null })
    for (const sentinel of Object.values(sentinels)) expect(rendered).not.toContain(sentinel)
    adapter.dispose()
  })
})

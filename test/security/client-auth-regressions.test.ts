import type { ConvexClient } from 'convex/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { LOADING_IDENTITY, toAuthenticatedIdentity } from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
} from '../../src/runtime/auth/client-engine'
import { IDENTITY_CHANGED } from '../../src/runtime/client-core/identity-changed-error'

function jwt(subject: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ sub: subject, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

function authenticatedState(subject: string, token = jwt(subject)) {
  return {
    identity: ref(toAuthenticatedIdentity(token, { id: subject })),
    pending: ref(false),
    authError: ref<string | null>(null),
  }
}

function client(): ConvexClient {
  return {
    setAuth(
      fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
      onChange: (authenticated: boolean) => void,
    ) {
      void fetchToken({ forceRefreshToken: false }).then((token) => onChange(Boolean(token)))
    },
    query: async () => ({}),
    mutation: async () => ({}),
    action: async () => ({}),
    onUpdate: () => () => {},
    connectionState: () => ({}),
    subscribeToConnectionState: () => () => {},
    close: async () => {},
  } as unknown as ConvexClient
}

function attach(coordinator: ConvexAuthCoordinator): void {
  let generation = coordinator.port.snapshot().identityGeneration
  coordinator.port.subscribe(() => {
    const next = coordinator.port.snapshot()
    if (next.identityGeneration === generation) return
    generation = next.identityGeneration
    void coordinator.port.initializePrimary(client())
  })
  coordinator.attachPrimary(client())
}

const coordinators: ConvexAuthCoordinator[] = []
afterEach(() => {
  for (const coordinator of coordinators.splice(0)) coordinator.dispose()
})

describe('auth security regressions', () => {
  it('uses one observer-owned token exchange for an integrated sign-in', async () => {
    let tokenExchangeCalls = 0
    const authClient = {
      convex: {
        token: async () => {
          tokenExchangeCalls += 1
          return { data: { token: jwt('B') }, error: null }
        },
      },
      signIn: {
        email: async () => ({ data: { token: 'session' }, error: null }),
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)
    attach(coordinator)
    const email = (
      coordinator.integratedSignIn as {
        email: () => Promise<unknown>
      }
    ).email
    let completed = false

    const signingIn = email().then(() => {
      completed = true
    })
    await Promise.resolve()
    await Promise.resolve()

    // The wrapper is only a FIFO/pending barrier: it neither exchanges a token
    // nor resolves before the canonical public-session observation arrives.
    expect(tokenExchangeCalls).toBe(0)
    expect(completed).toBe(false)
    expect(coordinator.isPending.value).toBe(true)

    await coordinator.reconcileSession('session')
    await signingIn

    expect(tokenExchangeCalls).toBe(1)
    expect(coordinator.user.value).toEqual(expect.objectContaining({ id: 'B' }))
    expect(completed).toBe(true)
    expect(coordinator.isPending.value).toBe(false)
  })

  it('captures a plugin session observation that completes before the action returns', async () => {
    const observer: { reconcile?: () => Promise<void> } = {}
    let tokenExchangeCalls = 0
    const authClient = {
      convex: {
        token: async () => {
          tokenExchangeCalls += 1
          return { data: { token: jwt('B') }, error: null }
        },
      },
      signIn: {
        email: async () => {
          if (!observer.reconcile) throw new Error('session observer is not attached')
          await observer.reconcile()
          return { data: { token: 'session' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    observer.reconcile = () => coordinator.reconcileSession('session')
    coordinators.push(coordinator)
    attach(coordinator)
    const email = (
      coordinator.integratedSignIn as {
        email: () => Promise<unknown>
      }
    ).email

    await email()

    expect(tokenExchangeCalls).toBe(1)
    expect(coordinator.user.value).toEqual(expect.objectContaining({ id: 'B' }))
    expect(coordinator.isPending.value).toBe(false)
  })

  it('fails closed when a token-bearing action produces no public session observation', async () => {
    vi.useFakeTimers()
    let tokenExchangeCalls = 0
    const authClient = {
      convex: {
        token: async () => {
          tokenExchangeCalls += 1
          return { data: { token: jwt('B') }, error: null }
        },
      },
      signIn: {
        email: async () => ({ data: { token: 'session' }, error: null }),
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)
    attach(coordinator)
    const email = (
      coordinator.integratedSignIn as {
        email: () => Promise<unknown>
      }
    ).email

    try {
      await vi.advanceTimersByTimeAsync(0)
      const outcome = email().then(
        () => null,
        (error: unknown) => error,
      )
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(5_000)
      const failure = await outcome

      expect(failure).toEqual(
        expect.objectContaining({
          kind: 'authentication',
          code: 'SESSION_RECONCILIATION_TIMEOUT',
        }),
      )
      expect(tokenExchangeCalls).toBe(0)
      expect(coordinator.user.value).toBeNull()
      expect(coordinator.token.value).toBeNull()
      expect(coordinator.status.value).toBe('error')
      expect(coordinator.isPending.value).toBe(false)
    } finally {
      coordinator.dispose()
      vi.useRealTimers()
    }
  })

  it('waits for the session observer to commit a successful sign-out', async () => {
    const authClient = {
      convex: { token: async () => ({ data: { token: jwt('A') }, error: null }) },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)
    attach(coordinator)
    let completed = false

    const signingOut = coordinator.signOut().then(() => {
      completed = true
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(coordinator.user.value).toEqual(expect.objectContaining({ id: 'A' }))
    expect(completed).toBe(false)

    await coordinator.reconcileSession(null)
    await signingOut

    expect(coordinator.user.value).toBeNull()
    expect(coordinator.token.value).toBeNull()
    expect(completed).toBe(true)
  })

  it('does not treat errored stale session data as confirmed sign-out absence', async () => {
    vi.useFakeTimers()
    let markSignOutStarted!: () => void
    const signOutStarted = new Promise<void>((resolve) => {
      markSignOutStarted = resolve
    })
    const token = jwt('A')
    const authClient = {
      convex: { token: async () => ({ data: { token }, error: null }) },
      signIn: {},
      signUp: {},
      signOut: async () => {
        markSignOutStarted()
        return { data: { success: true }, error: null }
      },
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A', token)
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)
    attach(coordinator)

    try {
      await vi.advanceTimersByTimeAsync(0)
      const outcome = coordinator.signOut().then(
        () => null,
        (error: unknown) => error,
      )
      await signOutStarted
      await coordinator.reconcileSession('session-A', 'session refresh failed')
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(outcome).resolves.toMatchObject({
        code: 'SESSION_RECONCILIATION_TIMEOUT',
      })
      expect(coordinator.token.value).toBeNull()
      expect(coordinator.user.value).toBeNull()
      expect(coordinator.status.value).toBe('error')
    } finally {
      coordinator.dispose()
      vi.useRealTimers()
    }
  })

  it('queues complete operations in invocation order and reports pending immediately', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve))
    const events: string[] = []
    let reconcileObservedSession: (() => void) | null = null
    const authClient = {
      convex: { token: async () => ({ data: { token: jwt('A') }, error: null }) },
      signIn: {
        email: async ({ first }: { first: boolean }) => {
          events.push(first ? 'first:start' : 'second:start')
          if (first) await firstGate
          events.push(first ? 'first:end' : 'second:end')
          setTimeout(() => reconcileObservedSession?.(), 0)
          return { data: { token: 'session' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const coordinator = createConvexAuthCoordinator({
      authClient,
      state: authenticatedState('A'),
    })
    reconcileObservedSession = () => {
      void coordinator.reconcileSession('session')
    }
    coordinators.push(coordinator)
    attach(coordinator)
    const email = (
      coordinator.integratedSignIn as {
        email: (input: { first: boolean }) => Promise<unknown>
      }
    ).email

    const first = email({ first: true })
    const second = email({ first: false })
    expect(coordinator.isPending.value).toBe(true)
    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
    expect(coordinator.isPending.value).toBe(false)
  })

  it('continues the identity queue after a thrown integrated operation', async () => {
    const events: string[] = []
    const authClient = {
      convex: { token: async () => ({ data: { token: jwt('A') }, error: null }) },
      signIn: {
        email: async ({ fail }: { fail: boolean }) => {
          events.push(fail ? 'failing' : 'following')
          if (fail) throw new Error('provider unavailable')
          return { data: null, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const coordinator = createConvexAuthCoordinator({
      authClient,
      state: authenticatedState('A'),
    })
    coordinators.push(coordinator)
    attach(coordinator)
    const email = (
      coordinator.integratedSignIn as {
        email: (input: { fail: boolean }) => Promise<unknown>
      }
    ).email

    const failing = email({ fail: true })
    const following = email({ fail: false })
    await expect(failing).rejects.toThrow('provider unavailable')
    await expect(following).resolves.toEqual({ data: null, error: null })
    expect(events).toEqual(['failing', 'following'])
    expect(coordinator.isPending.value).toBe(false)
  })

  it('orders integrated sign-in and raw sign-out only through session revisions', async () => {
    let subject: string | null = 'A'
    let releaseSignIn!: () => void
    const signInGate = new Promise<void>((resolve) => {
      releaseSignIn = resolve
    })
    const authClient = {
      convex: {
        token: async () =>
          subject
            ? { data: { token: jwt(subject) }, error: null }
            : { data: null, error: { status: 401 } },
      },
      signIn: {
        email: async () => {
          await signInGate
          subject = 'B'
          setTimeout(() => void reconcile('session-B'), 0)
          return { data: { token: 'session-B' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => {
        subject = null
        await reconcile(null)
        return { data: { success: true }, error: null }
      },
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    const reconcile = (sessionToken: string | null) => coordinator.reconcileSession(sessionToken)
    coordinators.push(coordinator)
    attach(coordinator)

    const integrated = (coordinator.integratedSignIn as { email: () => Promise<unknown> }).email()
    await Promise.resolve()

    // This deliberately bypasses coordinator.signOut's FIFO wrapper. It is not
    // a second identity path: the raw operation changes identity only through
    // the same canonical observer revision.
    await authClient.signOut()
    expect(coordinator.status.value).toBe('anonymous')

    releaseSignIn()
    await integrated
    expect(coordinator.user.value?.id).toBe('B')
    expect(coordinator.status.value).toBe('authenticated')
  })

  it('does not reuse an early sign-in revision after a later raw logout', async () => {
    vi.useFakeTimers()
    let subject: string | null = 'A'
    let releaseResult!: () => void
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve
    })
    let resolveEarlyRevision!: () => void
    const earlyRevision = new Promise<void>((resolve) => {
      resolveEarlyRevision = resolve
    })
    const authClient = {
      convex: {
        token: async () =>
          subject
            ? { data: { token: jwt(subject) }, error: null }
            : { data: null, error: { status: 401 } },
      },
      signIn: {
        email: async () => {
          subject = 'B'
          await reconcile('session-B')
          resolveEarlyRevision()
          await resultGate
          return { data: { token: 'session-B' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => {
        subject = null
        await reconcile(null)
        return { data: { success: true }, error: null }
      },
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    const reconcile = (sessionToken: string | null) => coordinator.reconcileSession(sessionToken)
    coordinators.push(coordinator)
    attach(coordinator)

    try {
      const integrated = (coordinator.integratedSignIn as { email: () => Promise<unknown> }).email()
      await earlyRevision
      await authClient.signOut()
      releaseResult()
      await Promise.resolve()
      const timedOut = expect(integrated).rejects.toMatchObject({
        code: 'SESSION_RECONCILIATION_TIMEOUT',
      })

      // The matching session-B revision is older than the raw logout and cannot
      // release this operation. With no newer session-B revision, the wrapper
      // fails closed at its fixed deadline.
      await vi.advanceTimersByTimeAsync(5_000)
      await timedOut
      expect(coordinator.status.value).toBe('error')
      expect(coordinator.user.value).toBeNull()
    } finally {
      coordinator.dispose()
      vi.useRealTimers()
    }
  })

  it('does not let an unrelated A session revision release a B sign-in wrapper', async () => {
    let subject = 'A'
    let signInCalls = 0
    const authClient = {
      convex: {
        token: async () => ({ data: { token: jwt(subject) }, error: null }),
      },
      signIn: {
        email: async () => {
          signInCalls += 1
          return { data: { token: 'session-B' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const coordinator = createConvexAuthCoordinator({
      authClient,
      state: authenticatedState('A'),
    })
    coordinators.push(coordinator)
    attach(coordinator)
    const email = (coordinator.integratedSignIn as { email: () => Promise<unknown> }).email
    let completed = false
    const signingIn = email().then(() => {
      completed = true
    })

    await vi.waitFor(() => expect(signInCalls).toBe(1))
    await coordinator.reconcileSession('session-A')
    await Promise.resolve()

    // Presence alone is insufficient: an unrelated revision for A cannot be
    // mistaken for the exact session-B token returned by this auth action.
    expect(completed).toBe(false)
    expect(coordinator.user.value?.id).toBe('A')

    subject = 'B'
    await coordinator.reconcileSession('session-B')
    await signingIn
    expect(completed).toBe(true)
    expect(coordinator.user.value?.id).toBe('B')
  })

  it('settles active and queued integrated operations on dispose and ignores late work', async () => {
    let releaseActive!: () => void
    const activeGate = new Promise<void>((resolve) => {
      releaseActive = resolve
    })
    const events: string[] = []
    const authClient = {
      convex: { token: async () => ({ data: { token: jwt('A') }, error: null }) },
      signIn: {
        email: async ({ operation }: { operation: 'active' | 'queued' }) => {
          events.push(operation)
          if (operation === 'active') await activeGate
          return { data: { token: `session-${operation}` }, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)
    attach(coordinator)
    const email = (
      coordinator.integratedSignIn as {
        email(input: { operation: 'active' | 'queued' }): Promise<unknown>
      }
    ).email

    const active = email({ operation: 'active' }).then(
      (value) => ({ status: 'resolved' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    )
    const queued = email({ operation: 'queued' }).then(
      (value) => ({ status: 'resolved' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    )
    await vi.waitFor(() => expect(events).toEqual(['active']))
    expect(coordinator.isPending.value).toBe(true)
    const beforeDispose = {
      identity: state.identity.value,
      token: coordinator.token.value,
      user: coordinator.user.value,
      snapshot: coordinator.port.snapshot(),
    }

    coordinator.dispose()
    const [activeResult, queuedResult] = await Promise.all([active, queued])
    for (const result of [activeResult, queuedResult]) {
      expect(result.status).toBe('rejected')
      if (result.status === 'rejected') {
        expect(result.error).toMatchObject({ code: IDENTITY_CHANGED })
      }
    }
    expect(events).toEqual(['active'])
    expect(coordinator.isPending.value).toBe(false)

    releaseActive()
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve()
    await coordinator.reconcileSession(null, 'late observer error')
    await coordinator.refresh()
    expect(events).toEqual(['active'])
    expect({
      identity: state.identity.value,
      token: coordinator.token.value,
      user: coordinator.user.value,
      snapshot: coordinator.port.snapshot(),
    }).toEqual(beforeDispose)
  })

  it('cancels a never-settling initial token exchange on dispose', async () => {
    vi.useFakeTimers()
    let resolveExchange!: (value: { data: { token: string }; error: null }) => void
    let capturedSignal: AbortSignal | undefined
    const authClient = {
      convex: {
        token: (options?: unknown) => {
          capturedSignal = (options as { fetchOptions?: { signal?: AbortSignal } } | undefined)
            ?.fetchOptions?.signal
          return new Promise<{ data: { token: string }; error: null }>((resolve) => {
            resolveExchange = resolve
          })
        },
      },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = {
      identity: ref(LOADING_IDENTITY),
      pending: ref(true),
      authError: ref<string | null>(null),
    }
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)

    try {
      coordinator.attachPrimary(client())
      expect(coordinator.isPending.value).toBe(true)
      expect(capturedSignal?.aborted).toBe(false)

      coordinator.dispose()
      await vi.advanceTimersByTimeAsync(0)

      expect(capturedSignal?.aborted).toBe(true)
      expect(coordinator.isPending.value).toBe(false)
      expect(vi.getTimerCount()).toBe(0)

      resolveExchange({ data: { token: jwt('late-A') }, error: null })
      await vi.advanceTimersByTimeAsync(0)
      expect(state.identity.value).toEqual(LOADING_IDENTITY)
    } finally {
      coordinator.dispose()
      vi.useRealTimers()
    }
  })

  it('fails closed when a session error retains stale authenticated data', async () => {
    const token = jwt('A')
    const state = authenticatedState('A', token)
    const coordinator = createConvexAuthCoordinator({
      authClient: {
        convex: { token: async () => ({ data: { token }, error: null }) },
        signIn: {},
        signUp: {},
        signOut: async () => ({ data: { success: true }, error: null }),
      } as unknown as AuthClientWithConvex,
      state,
    })
    coordinators.push(coordinator)
    attach(coordinator)

    // Better Auth deliberately retains old session data on non-401 transport
    // errors. The observer passes both `present` and the error; the coordinator
    // must not keep that stale principal dispatchable.
    await coordinator.reconcileSession('session-A', 'session refresh failed')

    expect(coordinator.status.value).toBe('error')
    expect(coordinator.token.value).toBeNull()
    expect(coordinator.user.value).toBeNull()
    expect(coordinator.port.snapshot()).toMatchObject({
      identityGeneration: 1,
      identityKey: 'anonymous',
    })
  })

  it('fails closed on canonical session loss and rejects stale authenticated revisions', async () => {
    let subject: string | null = 'A'
    let releaseExchange!: () => void
    const exchangeGate = new Promise<void>((resolve) => (releaseExchange = resolve))
    const authClient = {
      convex: {
        token: async () => {
          await exchangeGate
          return subject
            ? { data: { token: jwt(subject) }, error: null }
            : { data: null, error: { status: 401 } }
        },
      },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = authenticatedState('A')
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)
    attach(coordinator)

    const stale = coordinator.reconcileSession('session-A')
    subject = null
    await coordinator.reconcileSession(null)
    expect(coordinator.token.value).toBeNull()
    expect(coordinator.user.value).toBeNull()
    releaseExchange()
    await stale
    expect(coordinator.status.value).toBe('anonymous')
  })
})

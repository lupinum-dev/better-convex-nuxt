import type { ConvexClient } from 'convex/browser'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { toAuthenticatedIdentity } from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
} from '../../src/runtime/auth/client-engine'

function jwt(subject: string, serial = 0): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    sub: subject,
    serial,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.sig`
}

interface AuthConfiguration {
  fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>
  onChange: (authenticated: boolean) => void
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function fakeClient(configurations: AuthConfiguration[]): ConvexClient {
  return {
    setAuth(fetchToken: AuthConfiguration['fetchToken'], onChange: AuthConfiguration['onChange']) {
      configurations.push({ fetchToken, onChange })
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

describe('stale Convex setAuth configurations', () => {
  it('serves a fresh same-user token after cached-token rejection', async () => {
    const cachedToken = jwt('A', 1)
    const freshToken = jwt('A', 2)
    let exchangeCalls = 0
    const authClient = {
      convex: {
        token: async () => {
          exchangeCalls += 1
          return { data: { token: freshToken }, error: null }
        },
      },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = {
      identity: ref(toAuthenticatedIdentity(cachedToken, { id: 'A' })),
      pending: ref(false),
      authError: ref<string | null>(null),
    }
    const configurations: AuthConfiguration[] = []
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinator.attachPrimary(fakeClient(configurations))

    try {
      await vi.waitFor(() => expect(configurations).toHaveLength(1))
      const configuration = configurations[0]!
      expect(await configuration.fetchToken({ forceRefreshToken: false })).toBe(cachedToken)
      expect(exchangeCalls).toBe(0)

      expect(await configuration.fetchToken({ forceRefreshToken: true })).toBe(freshToken)
      expect(exchangeCalls).toBe(1)
      configuration.onChange(true)

      expect(coordinator.token.value).toBe(freshToken)
      expect(coordinator.user.value?.id).toBe('A')
      expect(coordinator.port.snapshot().identityGeneration).toBe(0)
    } finally {
      coordinator.dispose()
    }
  })

  it('returns null instead of retaining a cached token after definitive session rejection', async () => {
    const token = jwt('A')
    let sessionRejected = false
    const authClient = {
      convex: {
        token: async () =>
          sessionRejected
            ? { data: null, error: { status: 401 } }
            : { data: { token }, error: null },
      },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = {
      identity: ref(toAuthenticatedIdentity(token, { id: 'A' })),
      pending: ref(false),
      authError: ref<string | null>(null),
    }
    const configurations: AuthConfiguration[] = []
    const purgeIdentityPayloads = vi.fn()
    const coordinator = createConvexAuthCoordinator({
      authClient,
      state,
      purgeIdentityPayloads,
    })
    let generation = coordinator.port.snapshot().identityGeneration
    coordinator.port.subscribe(() => {
      const snapshot = coordinator.port.snapshot()
      if (snapshot.identityGeneration === generation) return
      generation = snapshot.identityGeneration
      void coordinator.port.initializePrimary(fakeClient(configurations))
    })
    coordinator.attachPrimary(fakeClient(configurations))

    try {
      await vi.waitFor(() => expect(configurations).toHaveLength(1))
      const active = configurations[0]!
      expect(await active.fetchToken({ forceRefreshToken: false })).toBe(token)
      active.onChange(true)
      expect(coordinator.status.value).toBe('authenticated')

      sessionRejected = true
      await expect(active.fetchToken({ forceRefreshToken: true })).resolves.toBeNull()
      active.onChange(false)

      await vi.waitFor(() => expect(coordinator.status.value).toBe('anonymous'))
      expect(coordinator.token.value).toBeNull()
      expect(coordinator.user.value).toBeNull()
      expect(coordinator.port.snapshot()).toMatchObject({
        identityGeneration: 1,
        identityKey: 'anonymous',
      })
      expect(purgeIdentityPayloads).toHaveBeenCalledTimes(1)
    } finally {
      coordinator.dispose()
    }
  })

  it('clears an unconfirmed hydrated identity when cached and fresh tokens are rejected', async () => {
    const cachedToken = jwt('A', 1)
    const freshToken = jwt('A', 2)
    const authClient = {
      convex: {
        token: async () => ({ data: { token: freshToken }, error: null }),
      },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = {
      identity: ref(toAuthenticatedIdentity(cachedToken, { id: 'A' })),
      pending: ref(false),
      authError: ref<string | null>(null),
    }
    const configurations: AuthConfiguration[] = []
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    let generation = coordinator.port.snapshot().identityGeneration
    coordinator.port.subscribe(() => {
      const snapshot = coordinator.port.snapshot()
      if (snapshot.identityGeneration === generation) return
      generation = snapshot.identityGeneration
      void coordinator.port.initializePrimary(fakeClient(configurations))
    })
    coordinator.attachPrimary(fakeClient(configurations))

    try {
      await vi.waitFor(() => expect(configurations).toHaveLength(1))
      const configuration = configurations[0]!
      expect(await configuration.fetchToken({ forceRefreshToken: false })).toBe(cachedToken)
      expect(await configuration.fetchToken({ forceRefreshToken: true })).toBe(freshToken)
      configuration.onChange(false)

      await vi.waitFor(() => expect(coordinator.status.value).toBe('anonymous'))
      expect(coordinator.token.value).toBeNull()
      expect(coordinator.user.value).toBeNull()
      // Hydrated A is display-stable but still identity-owned state. A
      // definitive browser rejection retires that boundary and publishes a
      // fresh anonymous generation before dispatch can open.
      expect(coordinator.port.snapshot()).toMatchObject({
        identityGeneration: 1,
        identityKey: 'anonymous',
      })
    } finally {
      coordinator.dispose()
    }
  })

  it('never serves a newer identity token from a stale or disposed fetcher', async () => {
    const tokenA = jwt('A')
    const tokenARefresh = jwt('A-refresh')
    const tokenB = jwt('B')
    const staleExchange = deferred<{ data: { token: string }; error: null }>()
    let exchangeCall = 0
    const authClient = {
      convex: {
        token: async () => {
          exchangeCall += 1
          if (exchangeCall === 1) return await staleExchange.promise
          return { data: { token: tokenB }, error: null }
        },
      },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const state = {
      identity: ref(toAuthenticatedIdentity(tokenA, { id: 'A' })),
      pending: ref(false),
      authError: ref<string | null>(null),
    }
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    const primaryConfigurations: AuthConfiguration[] = []
    const replacementConfigurations: AuthConfiguration[] = []
    let generation = coordinator.port.snapshot().identityGeneration
    coordinator.port.subscribe(() => {
      const snapshot = coordinator.port.snapshot()
      if (snapshot.identityGeneration === generation) return
      generation = snapshot.identityGeneration
      void coordinator.port.initializePrimary(fakeClient(replacementConfigurations))
    })
    coordinator.attachPrimary(fakeClient(primaryConfigurations))

    try {
      await vi.waitFor(() => expect(primaryConfigurations).toHaveLength(1))
      const primary = primaryConfigurations[0]!
      expect(await primary.fetchToken({ forceRefreshToken: false })).toBe(tokenA)
      primary.onChange(true)

      // Start a forced refresh while A's configuration is current, then stage B
      // through the canonical observer before that old request settles.
      const staleInFlight = primary.fetchToken({ forceRefreshToken: true })
      await vi.waitFor(() => expect(exchangeCall).toBe(1))
      const reconciling = coordinator.reconcileSession('session-B')
      await vi.waitFor(() => expect(replacementConfigurations).toHaveLength(1))
      const replacement = replacementConfigurations[0]!
      expect(await replacement.fetchToken({ forceRefreshToken: false })).toBe(tokenB)
      replacement.onChange(true)
      await reconciling

      // A request started after supersession and one that settles after
      // supersession must both fail closed; neither may borrow staged B.
      await expect(primary.fetchToken({ forceRefreshToken: false })).resolves.toBeNull()
      staleExchange.resolve({ data: { token: tokenARefresh }, error: null })
      await expect(staleInFlight).resolves.toBeNull()

      coordinator.dispose()
      await expect(replacement.fetchToken({ forceRefreshToken: false })).resolves.toBeNull()
    } finally {
      coordinator.dispose()
    }
  })
})

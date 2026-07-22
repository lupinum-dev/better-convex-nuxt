import type { ConvexClient } from 'convex/browser'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { toAuthenticatedIdentity } from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import {
  createConvexClientOwner,
  type ConvexClientOwner,
  type OwnedConvexClient,
} from '../../src/runtime/client-core/client-owner'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

function jwt(subject: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    sub: subject,
    exp: Math.floor(Date.now() / 1_000) + 3_600,
  })}.sig`
}

interface AuthConfiguration {
  fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>
  onChange: (authenticated: boolean) => void
}

class RefreshableClient extends MockConvexClient {
  readonly configurations: AuthConfiguration[] = []
  serverAuthenticated = false

  setAuth(
    fetchToken: AuthConfiguration['fetchToken'],
    onChange: AuthConfiguration['onChange'],
  ): void {
    const configuration = { fetchToken, onChange }
    this.configurations.push(configuration)
    void fetchToken({ forceRefreshToken: false }).then((token) => {
      if (this.configurations.at(-1) !== configuration) return
      this.serverAuthenticated = Boolean(token)
      onChange(this.serverAuthenticated)
    })
  }

  async runScheduledRefresh(): Promise<string | null> {
    const configuration = this.configurations.at(-1)
    if (!configuration) throw new Error('setAuth was not installed')
    const token = await configuration.fetchToken({ forceRefreshToken: true })
    this.serverAuthenticated = Boolean(token)
    configuration.onChange(this.serverAuthenticated)
    return token
  }

  close = async (): Promise<void> => {}
}

class FailingInitializationClient extends RefreshableClient {
  override setAuth(): void {
    throw new Error('replacement authentication initialization failed')
  }
}

describe('auth failure recovery regressions', () => {
  it('re-arms the current Convex auth configuration after sign-out fails in a newer epoch', async () => {
    const tokenA = jwt('A')
    const convexClient = new RefreshableClient()
    const authClient = {
      convex: { token: async () => ({ data: { token: tokenA }, error: null }) },
      signIn: {},
      signUp: {},
      signOut: async () => ({
        data: null,
        error: { message: 'provider denied logout' },
      }),
    } as unknown as AuthClientWithConvex
    const state: ConvexAuthCoordinatorState = {
      identity: ref(toAuthenticatedIdentity(tokenA, { id: 'A' })),
      pending: ref(false),
      authError: ref(null),
    }
    const coordinator = createConvexAuthCoordinator({ authClient, state })

    try {
      coordinator.attachPrimary(convexClient as unknown as ConvexClient)
      await vi.waitFor(() => expect(convexClient.serverAuthenticated).toBe(true))
      const epochBeforeSignOut = coordinator.port.snapshot().authEpoch

      await expect(coordinator.signOut()).rejects.toThrow('provider denied logout')
      const refreshedToken = await convexClient.runScheduledRefresh()

      // Failed sign-out still invalidates older async work, so the epoch remains
      // monotonic. The retained A identity therefore needs a newly installed
      // setAuth fetcher scoped to that newer epoch; otherwise Convex becomes
      // anonymous while the public coordinator continues to advertise A.
      expect({
        epochAdvanced: coordinator.port.snapshot().authEpoch > epochBeforeSignOut,
        configurations: convexClient.configurations.length,
        refreshedToken,
        serverAuthenticated: convexClient.serverAuthenticated,
        publicStatus: coordinator.status.value,
        publicSubject: coordinator.user.value?.id,
      }).toEqual({
        epochAdvanced: true,
        configurations: 2,
        refreshedToken: tokenA,
        serverAuthenticated: true,
        publicStatus: 'authenticated',
        publicSubject: 'A',
      })
    } finally {
      coordinator.dispose()
    }
  })

  it('fails closed when a failed sign-out has already lost the Better Auth session', async () => {
    const tokenA = jwt('A')
    const originalClient = new RefreshableClient()
    const recoveryClient = new RefreshableClient()
    const authClient = {
      convex: { token: async () => ({ data: null, error: { status: 401 } }) },
      signIn: {},
      signUp: {},
      signOut: async () => ({
        data: null,
        error: { message: 'provider denied logout' },
      }),
    } as unknown as AuthClientWithConvex
    const state: ConvexAuthCoordinatorState = {
      identity: ref(toAuthenticatedIdentity(tokenA, { id: 'A' })),
      pending: ref(false),
      authError: ref(null),
    }
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    let generation = coordinator.port.snapshot().identityGeneration
    coordinator.port.subscribe(() => {
      const snapshot = coordinator.port.snapshot()
      if (snapshot.identityGeneration === generation) return
      generation = snapshot.identityGeneration
      void coordinator.port.initializePrimary(recoveryClient as unknown as ConvexClient)
    })

    try {
      coordinator.attachPrimary(originalClient as unknown as ConvexClient)
      await vi.waitFor(() => expect(originalClient.serverAuthenticated).toBe(true))

      await expect(coordinator.signOut()).rejects.toThrow('provider denied logout')

      expect(coordinator.status.value).toBe('error')
      expect(coordinator.token.value).toBeNull()
      expect(coordinator.user.value).toBeNull()
      expect(coordinator.port.snapshot()).toMatchObject({
        identityGeneration: 1,
        identityKey: 'anonymous',
      })
      expect(recoveryClient.serverAuthenticated).toBe(false)
      await expect(
        originalClient.configurations[0]!.fetchToken({ forceRefreshToken: false }),
      ).resolves.toBeNull()
    } finally {
      coordinator.dispose()
    }
  })

  it.each(['factory', 'initialization'] as const)(
    'crosses a fresh anonymous generation after replacement %s failure',
    async (failureMode) => {
      const tokenA = jwt('A')
      const tokenB = jwt('B')
      let factoryCalls = 0
      let owner: ConvexClientOwner | null = null

      owner = createConvexClientOwner({
        primaryFactory: () => {
          factoryCalls += 1
          if (factoryCalls === 2 && failureMode === 'factory') {
            throw new Error('replacement factory failed')
          }
          const candidate =
            factoryCalls === 2 && failureMode === 'initialization'
              ? new FailingInitializationClient()
              : new RefreshableClient()
          candidate.setQueryHandler('public', () => 'anonymous-ok')
          return candidate as unknown as OwnedConvexClient
        },
      })

      const authClient = {
        convex: { token: async () => ({ data: { token: tokenB }, error: null }) },
        signIn: {},
        signUp: {},
        signOut: async () => ({ data: {}, error: null }),
      } as unknown as AuthClientWithConvex
      const state: ConvexAuthCoordinatorState = {
        identity: ref(toAuthenticatedIdentity(tokenA, { id: 'A' })),
        pending: ref(false),
        authError: ref(null),
      }
      const coordinator = createConvexAuthCoordinator({ authClient, state })

      try {
        owner.attachIdentityPort(coordinator.port)
        coordinator.attachPrimary(owner.getPrimary()!.client as ConvexClient)
        await vi.waitFor(() => expect(coordinator.status.value).toBe('authenticated'))

        await expect(coordinator.reconcileSession('session-B')).resolves.toBeUndefined()

        // Generation 1 was already observed by the owner and its only candidate
        // failed. Publishing anonymous inside that same generation cannot cause
        // an owner replacement, leaving no primary. Recovery is one explicit
        // anonymous generation (and one candidate attempt), not a same-generation
        // retry loop.
        await vi.waitFor(() =>
          expect(coordinator.port.snapshot()).toMatchObject({
            identityGeneration: 2,
            identityKey: 'anonymous',
          }),
        )
        await vi.waitFor(() => expect(owner?.getPrimary()?.identityGeneration).toBe(2))
        expect(factoryCalls).toBe(3)
        await expect(owner.handle.query(mockFnRef<'query'>('public'), {})).resolves.toBe(
          'anonymous-ok',
        )
      } finally {
        coordinator.dispose()
        await owner.dispose()
      }
    },
  )
})

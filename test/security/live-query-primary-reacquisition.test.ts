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
  type OwnedConvexClient,
} from '../../src/runtime/client-core/client-owner'
import { createQueryExecutionGate } from '../../src/runtime/utils/query-execution-gate'
import { selectLiveQueryClient } from '../../src/runtime/utils/query-foundation'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

vi.mock('#imports', () => ({ useState: vi.fn() }))

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

class ConfirmationControlledClient extends MockConvexClient {
  private configuration: AuthConfiguration | null = null
  closeCalls = 0

  setAuth(
    fetchToken: AuthConfiguration['fetchToken'],
    onChange: AuthConfiguration['onChange'],
  ): void {
    this.configuration = { fetchToken, onChange }
  }

  hasAuthConfiguration(): boolean {
    return this.configuration !== null
  }

  async confirmAuthenticated(): Promise<void> {
    const configuration = this.configuration
    if (!configuration) throw new Error('Expected setAuth before server confirmation')
    const token = await configuration.fetchToken({ forceRefreshToken: false })
    if (!token) throw new Error('Expected a token for authenticated confirmation')
    configuration.onChange(true)
  }

  close = async (): Promise<void> => {
    this.closeCalls += 1
  }
}

describe('live primary query reacquisition', () => {
  it('re-registers regular and paginated listeners while B awaits confirmation', async () => {
    const tokenA = jwt('A')
    const tokenB = jwt('B')
    const primaries: ConfirmationControlledClient[] = []
    const anonymous = new ConfirmationControlledClient()
    const owner = createConvexClientOwner({
      primaryFactory: () => {
        const client = new ConfirmationControlledClient()
        primaries.push(client)
        return client as unknown as OwnedConvexClient
      },
      anonymousFactory: () => anonymous as unknown as OwnedConvexClient,
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
    const primaryGate = createQueryExecutionGate({
      authStatus: 'authenticated',
      authMode: 'optional',
      identityKey: 'user:A',
      skipped: false,
      subscribe: true,
    })
    const noneGate = createQueryExecutionGate({
      authStatus: 'authenticated',
      authMode: 'none',
      identityKey: 'user:A',
      skipped: false,
      subscribe: true,
    })
    const queries = [
      {
        name: 'regular',
        reference: mockFnRef<'query'>('security:regular'),
        args: { channel: 'regular' },
        callback: vi.fn(),
      },
      {
        name: 'paginated',
        reference: mockFnRef<'query'>('security:paginated'),
        args: {
          channel: 'paginated',
          paginationOpts: { numItems: 10, cursor: null, id: 1 },
        },
        callback: vi.fn(),
      },
    ]

    owner.attachIdentityPort(coordinator.port)
    const clientA = primaries[0]!
    coordinator.attachPrimary(clientA as unknown as ConvexClient)

    try {
      await vi.waitFor(() => expect(clientA.hasAuthConfiguration()).toBe(true))
      await clientA.confirmAuthenticated()
      await expect(coordinator.ready({ timeoutMs: 0 })).resolves.toBe('authenticated')

      // `none` remains structurally isolated on the raw, never-authenticated
      // client. Only primary auth modes route through the replacement-safe handle.
      expect(selectLiveQueryClient(owner, noneGate)).toBe(anonymous)
      expect(selectLiveQueryClient(owner, primaryGate)).toBe(owner.handle)

      let stops = queries.map(({ reference, args, callback }) =>
        selectLiveQueryClient(owner, primaryGate)!.onUpdate(reference, args, callback),
      )
      expect(clientA.activeListenerCount()).toBe(2)

      const transition = coordinator.reconcileSession('session-B')
      await vi.waitFor(() => expect(primaries).toHaveLength(2))
      const clientB = primaries[1]!
      await vi.waitFor(() => expect(clientB.hasAuthConfiguration()).toBe(true))

      // This is the composables' synchronous identity-change ceremony: release
      // A, then acquire B before B is confirmed/published. At this point the
      // owner deliberately has no dispatchable primary.
      expect(owner.getPrimary()).toBeNull()
      for (const stop of stops) stop()
      expect(clientA.activeListenerCount()).toBe(0)

      const pendingPrimary = selectLiveQueryClient(owner, primaryGate)
      expect(pendingPrimary).toBe(owner.handle)
      stops = queries.map(({ reference, args, callback }) =>
        pendingPrimary!.onUpdate(reference, args, callback),
      )
      expect(clientB.activeListenerCount()).toBe(0)

      await clientB.confirmAuthenticated()
      await expect(transition).resolves.toBeUndefined()
      await vi.waitFor(() => expect(owner.getPrimary()?.client).toBe(clientB))
      expect(clientB.activeListenerCount()).toBe(2)

      for (const query of queries) {
        clientB.emitQueryResult(query.reference, query.args, `${query.name}-from-B`)
        expect(query.callback).toHaveBeenCalledWith(`${query.name}-from-B`)
      }

      for (const stop of stops) stop()
      expect(clientB.activeListenerCount()).toBe(0)
      expect(clientA.closeCalls).toBe(1)
    } finally {
      coordinator.dispose()
      await owner.dispose()
    }
  })
})

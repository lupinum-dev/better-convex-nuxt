import type { ConvexClient } from 'convex/browser'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  LOADING_IDENTITY,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import {
  createConvexClientOwner,
  type ConvexClientHandle,
  type ConvexClientOwner,
  type OwnedConvexClient,
} from '../../src/runtime/client-core/client-owner'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function makeJwt(subject: string): string {
  const payload = {
    sub: subject,
    email: `${subject}@test`,
    exp: Math.floor(Date.now() / 1_000) + 3_600,
  }
  return `${toBase64Url(JSON.stringify({ alg: 'none' }))}.${toBase64Url(JSON.stringify(payload))}.sig`
}

interface AuthConfiguration {
  fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>
  onChange: (authenticated: boolean) => void
}

/**
 * A controllable stand-in for Convex 1.40's public setAuth ceremony. The real
 * client invokes onChange only after a server Transition advances the identity
 * version; keeping that callback manual exposes the library-owned interval in
 * which no primary operation may dispatch.
 */
class ConfirmationControlledClient extends MockConvexClient {
  private configuration: AuthConfiguration | null = null

  constructor() {
    super()
    this.setQueryHandler('security:query', async () => 'query-result')
    this.setMutationHandler('security:mutation', async () => 'mutation-result')
    this.setActionHandler('security:action', async () => 'action-result')
  }

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
    if (!token) throw new Error('Expected a staged token before server confirmation')
    configuration.onChange(true)
  }

  close = async (): Promise<void> => {}
}

interface PendingHandleOperations {
  query: Promise<unknown>
  mutation: Promise<unknown>
  action: Promise<unknown>
  callback: ReturnType<typeof vi.fn>
  stop: ReturnType<ConvexClientHandle['onUpdate']>
}

function invokeEveryHandleSurface(owner: ConvexClientOwner): PendingHandleOperations {
  const callback = vi.fn()
  const query = owner.handle.query(mockFnRef<'query'>('security:query'), {})
  const mutation = owner.handle.mutation(mockFnRef<'mutation'>('security:mutation'), {})
  const action = owner.handle.action(mockFnRef<'action'>('security:action'), {})
  const stop = owner.handle.onUpdate(mockFnRef<'query'>('security:subscription'), {}, callback)

  // Keep a future gated implementation free to reject these promises on test
  // cleanup without producing an unhandled rejection.
  void query.catch(() => {})
  void mutation.catch(() => {})
  void action.catch(() => {})

  return { query, mutation, action, callback, stop }
}

function expectNoPrimaryDispatch(client: ConfirmationControlledClient): void {
  expect({
    query: client.calls.query.length,
    mutation: client.calls.mutation.length,
    action: client.calls.action.length,
    onUpdate: client.calls.onUpdate.length,
  }).toEqual({ query: 0, mutation: 0, action: 0, onUpdate: 0 })
}

async function expectOperationsAfterConfirmation(
  client: ConfirmationControlledClient,
  operations: PendingHandleOperations,
): Promise<void> {
  await expect(operations.query).resolves.toBe('query-result')
  await expect(operations.mutation).resolves.toBe('mutation-result')
  await expect(operations.action).resolves.toBe('action-result')
  await vi.waitFor(() => expect(client.calls.onUpdate).toHaveLength(1))
  client.emitQueryResultByPath('security:subscription', 'subscription-result')
  expect(operations.callback).toHaveBeenCalledWith('subscription-result')
}

function createHarness(input: {
  identity: AuthIdentity
  pending: boolean
  fetchToken: () => Promise<{ data: { token: string }; error: null }>
}) {
  const client = new ConfirmationControlledClient()
  const owner = createConvexClientOwner({
    primaryFactory: () => client as unknown as OwnedConvexClient,
  })
  const authClient = {
    convex: { token: input.fetchToken },
    signIn: {},
    signUp: {},
    signOut: async () => ({ data: {}, error: null }),
  } as unknown as AuthClientWithConvex
  const state: ConvexAuthCoordinatorState = {
    identity: ref(input.identity),
    pending: ref(input.pending),
    authError: ref(null),
  }
  const coordinator = createConvexAuthCoordinator({ authClient, state })

  coordinator.attachPrimary(client as unknown as ConvexClient)
  owner.attachIdentityPort(coordinator.port)

  return { client, coordinator, owner }
}

describe('stable handle first-confirmation gate', () => {
  it('holds query, mutation, action, and onUpdate during non-hydrated startup', async () => {
    const tokenResponse = deferred<{ data: { token: string }; error: null }>()
    const harness = createHarness({
      identity: LOADING_IDENTITY,
      pending: true,
      fetchToken: () => tokenResponse.promise,
    })
    const operations = invokeEveryHandleSurface(harness.owner)

    try {
      // The Better Auth exchange has not completed, so setAuth has not started.
      // No stable-handle surface may use the eagerly constructed anonymous
      // primary in this interval.
      await Promise.resolve()
      expectNoPrimaryDispatch(harness.client)

      tokenResponse.resolve({ data: { token: makeJwt('USER_A') }, error: null })
      await vi.waitFor(() => expect(harness.client.hasAuthConfiguration()).toBe(true))

      // A staged token is still not a server-confirmed identity.
      expectNoPrimaryDispatch(harness.client)

      await harness.client.confirmAuthenticated()
      await expectOperationsAfterConfirmation(harness.client, operations)
    } finally {
      operations.stop()
      harness.coordinator.dispose()
      await harness.owner.dispose()
    }
  })

  it('treats an SSR-hydrated identity as display-only until live confirmation', async () => {
    const hydratedToken = makeJwt('USER_A')
    const harness = createHarness({
      identity: toAuthenticatedIdentity(hydratedToken, {
        id: 'USER_A',
        email: 'USER_A@test',
      }),
      pending: false,
      fetchToken: async () => ({ data: { token: hydratedToken }, error: null }),
    })
    const operations = invokeEveryHandleSurface(harness.owner)

    try {
      expect(harness.coordinator.status.value).toBe('authenticated')
      expect(harness.client.hasAuthConfiguration()).toBe(true)

      // Hydration may render authenticated display state, but the stable owner
      // handle must remain closed until Convex confirms the token on this socket.
      await Promise.resolve()
      expectNoPrimaryDispatch(harness.client)

      await harness.client.confirmAuthenticated()
      await expectOperationsAfterConfirmation(harness.client, operations)
    } finally {
      operations.stop()
      harness.coordinator.dispose()
      await harness.owner.dispose()
    }
  })
})

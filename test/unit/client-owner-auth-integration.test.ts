import type { ConvexClient } from 'convex/browser'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { LOADING_IDENTITY } from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import {
  createConvexClientOwner,
  type OwnedConvexClient,
} from '../../src/runtime/client/client-owner'
import { IDENTITY_CHANGED } from '../../src/runtime/client/identity-changed-error'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

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

class ConfirmingClient extends MockConvexClient {
  closeCalls = 0

  setAuth(
    fetcher: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
    onChange: (authenticated: boolean) => void,
  ): void {
    void fetcher({ forceRefreshToken: false }).then((token) => onChange(Boolean(token)))
  }

  close = async (): Promise<void> => {
    this.closeCalls += 1
  }

  hangingMutation(): Promise<never> {
    return new Promise<never>(() => {})
  }
}

describe('client owner + auth coordinator failure boundary', () => {
  it('fails closed and settles the real generation transition when the replacement factory throws', async () => {
    const factoryFailure = new Error('replacement construction failed')
    let factoryCalls = 0
    const owner = createConvexClientOwner({
      primaryFactory: () => {
        factoryCalls += 1
        if (factoryCalls > 1) throw factoryFailure
        return new ConfirmingClient() as unknown as OwnedConvexClient
      },
    })

    const responses = [makeJwt('A')]
    const authClient = {
      convex: {
        token: async () => ({
          data: { token: responses.shift() ?? '' },
          error: null,
        }),
      },
      signIn: {},
      signUp: {},
      signOut: async () => ({ data: {}, error: null }),
    } as unknown as AuthClientWithConvex
    const state: ConvexAuthCoordinatorState = {
      identity: ref(LOADING_IDENTITY),
      pending: ref(true),
      authError: ref(null),
    }
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    owner.attachAuthPort(coordinator.port)
    coordinator.attachPrimary(owner.getPrimary()!.client as ConvexClient)

    await expect(coordinator.ready({ timeoutMs: 0 })).resolves.toBe('authenticated')
    expect((coordinator.user.value as { id: string }).id).toBe('A')
    const generationBefore = coordinator.port.snapshot().identityGeneration
    const authenticatedClient = owner.getPrimary()!.client as unknown as ConfirmingClient
    authenticatedClient.setMutationHandler('hold', () => authenticatedClient.hangingMutation())
    const inflight = owner.handle.mutation(mockFnRef<'mutation'>('hold'), {})
    const inflightAssertion = expect(inflight).rejects.toMatchObject({
      code: IDENTITY_CHANGED,
    })
    await Promise.resolve()

    responses.push(makeJwt('B'))
    const transition = coordinator.reconcileSession('better-auth-session-B')

    await expect(transition).resolves.toBeUndefined()
    await inflightAssertion
    expect(coordinator.status.value).toBe('error')
    expect(coordinator.port.snapshot()).toMatchObject({
      // One generation retires A for the failed B candidate; one fresh
      // generation installs the explicit anonymous recovery candidate.
      identityGeneration: generationBefore + 2,
      identityKey: 'anonymous',
    })
    expect(owner.getPrimary()).toBeNull()
    expect(authenticatedClient.closeCalls).toBe(1)
    await expect(owner.handle.query(mockFnRef<'query'>('secret'), {})).rejects.toMatchObject({
      code: IDENTITY_CHANGED,
    })

    // failPrimary performs one bounded anonymous recovery generation. It does
    // not spin another factory attempt after that recovery fails.
    await expect(coordinator.ready({ timeoutMs: 0 })).resolves.toBe('error')
    await Promise.resolve()
    expect(factoryCalls).toBe(3)

    coordinator.dispose()
    await owner.dispose()
    expect(authenticatedClient.closeCalls).toBe(1)
  })
})

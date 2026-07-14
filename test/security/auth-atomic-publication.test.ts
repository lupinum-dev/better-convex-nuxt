import type { ConvexClient } from 'convex/browser'
import { describe, expect, it } from 'vitest'
import { ref, watch } from 'vue'

import { toAuthenticatedIdentity } from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
} from '../../src/runtime/auth/client-engine'

function jwt(subject: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    sub: subject,
    exp: Math.floor(Date.now() / 1_000) + 3_600,
  })}.sig`
}

function confirmingClient(): ConvexClient {
  return {
    setAuth(
      fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
      onChange: (authenticated: boolean) => void,
    ) {
      void fetchToken({ forceRefreshToken: false }).then((token) => onChange(token !== null))
    },
  } as unknown as ConvexClient
}

describe('atomic public auth identity', () => {
  it('never exposes a token/user pair from different principals to sync observers', async () => {
    const tokenA = jwt('A')
    const tokenB = jwt('B')
    let exchangedToken = tokenA
    const state = {
      identity: ref(toAuthenticatedIdentity(tokenA, { id: 'A' })),
      pending: ref(false),
      authError: ref<string | null>(null),
    }
    const coordinator = createConvexAuthCoordinator({
      authClient: {
        convex: {
          token: async () => ({ data: { token: exchangedToken }, error: null }),
        },
        signIn: {},
        signUp: {},
        signOut: async () => ({ data: { success: true }, error: null }),
      } as unknown as AuthClientWithConvex,
      state,
    })
    let observedGeneration = coordinator.port.snapshot().identityGeneration
    const stopPort = coordinator.port.subscribe(() => {
      const snapshot = coordinator.port.snapshot()
      if (snapshot.identityGeneration === observedGeneration) return
      observedGeneration = snapshot.identityGeneration
      void coordinator.port.initializePrimary(confirmingClient())
    })
    coordinator.attachPrimary(confirmingClient())
    await coordinator.ready()

    const observed: Array<[string | null, string | null]> = []
    const stop = watch(
      [coordinator.token, coordinator.user],
      ([token, user]) => {
        const subject = token
          ? (
              JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
                sub: string
              }
            ).sub
          : null
        observed.push([subject, user?.id ?? null])
      },
      { flush: 'sync' },
    )

    try {
      exchangedToken = tokenB
      await coordinator.reconcileSession('better-auth-session-b')
      await coordinator.reconcileSession(null)

      expect(observed).toEqual([
        ['B', 'B'],
        [null, null],
      ])
    } finally {
      stop()
      stopPort()
      coordinator.dispose()
    }
  })
})

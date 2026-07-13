import type { ConvexClient } from 'convex/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'

import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
} from '../../src/runtime/auth/client-engine'

function jwt(subject: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ sub: subject, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
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
    void coordinator.port.initializePrimary(client(), next.authEpoch)
  })
  coordinator.attachPrimary(client())
}

const coordinators: ConvexAuthCoordinator[] = []
afterEach(() => {
  for (const coordinator of coordinators.splice(0)) coordinator.dispose()
})

describe('auth security regressions', () => {
  it('queues complete operations in invocation order and reports pending immediately', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve))
    const events: string[] = []
    const authClient = {
      convex: { token: async () => ({ data: { token: jwt('A') }, error: null }) },
      signIn: {
        email: async ({ first }: { first: boolean }) => {
          events.push(first ? 'first:start' : 'second:start')
          if (first) await firstGate
          events.push(first ? 'first:end' : 'second:end')
          return { data: { token: 'session' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex
    const coordinator = createConvexAuthCoordinator({
      authClient,
      state: {
        token: ref(jwt('A')),
        user: ref({ id: 'A' }),
        pending: ref(false),
        authError: ref(null),
      },
    })
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
    const state = {
      token: ref(jwt('A')),
      user: ref({ id: 'A' }),
      pending: ref(false),
      authError: ref<string | null>(null),
    }
    const coordinator = createConvexAuthCoordinator({ authClient, state })
    coordinators.push(coordinator)
    attach(coordinator)

    const stale = coordinator.reconcileSession(true)
    subject = null
    await coordinator.reconcileSession(false)
    expect(state.token.value).toBeNull()
    expect(state.user.value).toBeNull()
    releaseExchange()
    await stale
    expect(coordinator.status.value).toBe('anonymous')
  })
})

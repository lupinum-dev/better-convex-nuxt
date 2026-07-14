import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import { afterEach, expect, test, vi } from 'vitest'
import { effectScope, ref, type Ref } from 'vue'

import { LOADING_IDENTITY, type AuthIdentity } from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
} from '../../src/runtime/auth/client-engine'
import { observeBetterAuthSession } from '../../src/runtime/auth/session-observer'
import {
  createConvexClientOwner,
  type OwnedConvexClient,
} from '../../src/runtime/client/client-owner'

const BETTER_AUTH_STORAGE_KEY = 'better-auth.message'

function sessionToken(subject: string): string {
  return `better-auth-session-token-${subject}`
}

function jwt(subject: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
  return `${encode({ alg: 'none' })}.${encode({
    sub: subject,
    exp: Math.floor(Date.now() / 1_000) + 3_600,
  })}.sig`
}

function tokenSubject(token: string | null): string {
  if (!token) return 'anonymous'
  const encoded = token.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/')
  const payload = JSON.parse(atob(encoded)) as { sub: string }
  return payload.sub
}

function crossTabSessionEvent(trigger: 'getSession' | 'signout'): StorageEvent {
  return new StorageEvent('storage', {
    key: BETTER_AUTH_STORAGE_KEY,
    newValue: JSON.stringify({
      event: 'session',
      data: { trigger },
      clientId: 'OTHER_TAB',
      timestamp: Math.floor(Date.now() / 1_000),
    }),
  })
}

class BrowserConvexClient {
  subject = 'anonymous'
  closed = false

  setAuth(
    fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
    onChange: (authenticated: boolean) => void,
  ): void {
    void fetchToken({ forceRefreshToken: false }).then((token) => {
      if (this.closed) return
      this.subject = tokenSubject(token)
      onChange(token !== null)
    })
  }

  query = async () => this.subject as never
  mutation = async () => this.subject as never
  action = async () => this.subject as never
  onUpdate = (() => () => {}) as unknown as ConvexClient['onUpdate']
  connectionState = () => ({}) as ReturnType<ConvexClient['connectionState']>
  subscribeToConnectionState = () => () => {}
  close = async () => {
    this.closed = true
  }
}

type BrowserSessionRef = Readonly<
  Ref<{
    isPending: boolean
    isRefetching: boolean
    refetch: () => Promise<void>
  }>
>

function dispatchSubject(owner: ReturnType<typeof createConvexClientOwner>): Promise<unknown> {
  const query = owner.handle.query as unknown as (
    functionReference: unknown,
    args: unknown,
  ) => Promise<unknown>
  return query({}, {})
}

afterEach(() => {
  localStorage.removeItem(BETTER_AUTH_STORAGE_KEY)
})

test('real Chromium session events converge cross-tab identity through one observer', async () => {
  let serverSubject: string | null = 'A'
  let sessionRequests = 0
  let tokenRequests = 0
  const clients: BrowserConvexClient[] = []
  const observedSessionTokens: Array<string | null> = []

  const authClient = createAuthClient({
    baseURL: 'http://localhost:3000/api/auth',
    plugins: [convexClient()],
    sessionOptions: { refetchOnWindowFocus: true },
    fetchOptions: {
      customFetchImpl: async (input) => {
        const url = String(input)
        const headers = { 'content-type': 'application/json' }
        if (url.includes('/get-session')) {
          sessionRequests += 1
          return new Response(
            JSON.stringify(
              serverSubject
                ? {
                    session: {
                      id: `SESSION_${serverSubject}`,
                      token: sessionToken(serverSubject),
                    },
                    user: { id: serverSubject, email: `${serverSubject}@example.test` },
                  }
                : { session: null, user: null },
            ),
            { headers },
          )
        }
        if (url.includes('/convex/token')) {
          tokenRequests += 1
          if (!serverSubject) {
            return new Response(JSON.stringify({ message: 'Unauthorized' }), {
              status: 401,
              headers,
            })
          }
          return new Response(JSON.stringify({ token: jwt(serverSubject) }), { headers })
        }
        return new Response(JSON.stringify({ message: 'Not found' }), {
          status: 404,
          headers,
        })
      },
    },
  })

  const state = {
    identity: ref<AuthIdentity>(LOADING_IDENTITY),
    pending: ref(true),
    authError: ref<string | null>(null),
  }
  const coordinator = createConvexAuthCoordinator({
    authClient: authClient as unknown as AuthClientWithConvex,
    state,
  })
  const owner = createConvexClientOwner({
    primaryFactory: () => {
      const client = new BrowserConvexClient()
      clients.push(client)
      return client as unknown as OwnedConvexClient
    },
  })
  owner.attachAuthPort(coordinator.port)
  coordinator.attachPrimary(owner.getPrimary()!.client as ConvexClient)

  const scope = effectScope()
  let session!: BrowserSessionRef
  scope.run(() => {
    session = authClient.useSession() as unknown as BrowserSessionRef
    observeBetterAuthSession(authClient, (observedToken, errorMessage) => {
      observedSessionTokens.push(observedToken)
      void coordinator.reconcileSession(observedToken, errorMessage)
    })
  })

  try {
    await vi.waitFor(() => expect(coordinator.user.value?.id).toBe('A'))
    await vi.waitFor(() => expect(session.value.isPending).toBe(false))
    await vi.waitFor(() => expect(session.value.isRefetching).toBe(false))
    expect(observedSessionTokens).toEqual([sessionToken('A')])
    expect(await dispatchSubject(owner)).toBe('A')

    // An old tab receives a real browser StorageEvent after another tab changes
    // the shared session from A to B. Better Auth refetches, and only the public
    // session observer drives the Convex token exchange and owner replacement.
    const tokenRequestsBeforeSwitch = tokenRequests
    serverSubject = 'B'
    window.dispatchEvent(crossTabSessionEvent('getSession'))
    await vi.waitFor(() => expect(coordinator.user.value?.id).toBe('B'))
    expect(tokenRequests).toBe(tokenRequestsBeforeSwitch + 1)
    expect(observedSessionTokens).toEqual([sessionToken('A'), sessionToken('B')])
    expect(await dispatchSubject(owner)).toBe('B')
    expect(clients[0]!.closed).toBe(true)

    // Model an OAuth callback completing in the other tab while focus, online,
    // storage, and an explicit refetch overlap in this still-open tab. The exact
    // Better Auth atom aborts/supersedes redundant session fetches; one changed
    // public revision translates to one Convex exchange for A.
    const tokenRequestsBeforeOverlap = tokenRequests
    const sessionRequestsBeforeOverlap = sessionRequests
    serverSubject = 'A'
    const manualRefetch = session.value.refetch()
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(crossTabSessionEvent('getSession'))
    await manualRefetch
    await vi.waitFor(() => expect(coordinator.user.value?.id).toBe('A'))
    expect(tokenRequests).toBe(tokenRequestsBeforeOverlap + 1)
    expect(sessionRequests).toBeGreaterThan(sessionRequestsBeforeOverlap)
    expect(observedSessionTokens).toEqual([sessionToken('A'), sessionToken('B'), sessionToken('A')])
    expect(await dispatchSubject(owner)).toBe('A')

    serverSubject = null
    window.dispatchEvent(crossTabSessionEvent('signout'))
    await vi.waitFor(() => expect(coordinator.status.value).toBe('anonymous'))
    expect(state.identity.value).toEqual({ status: 'anonymous' })
    expect(coordinator.token.value).toBeNull()
    expect(coordinator.user.value).toBeNull()
    expect(observedSessionTokens).toEqual([
      sessionToken('A'),
      sessionToken('B'),
      sessionToken('A'),
      null,
    ])
    expect(await dispatchSubject(owner)).toBe('anonymous')

    // Nanostores deliberately delays its final onMount cleanup by one second.
    // After that exact upstream grace period, browser events allocate no more
    // session requests and late callbacks cannot resurrect identity.
    scope.stop()
    coordinator.dispose()
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    const requestsAfterDispose = sessionRequests
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(crossTabSessionEvent('getSession'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sessionRequests).toBe(requestsAfterDispose)
    expect(coordinator.user.value).toBeNull()
  } finally {
    scope.stop()
    coordinator.dispose()
    await owner.dispose()
  }
})

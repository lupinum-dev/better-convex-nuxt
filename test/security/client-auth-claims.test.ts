import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import type { AuthIdentityPort } from '../../src/runtime/auth/identity-port'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function makeJwt(subject: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600
  return `${toBase64Url(JSON.stringify({ alg: 'none' }))}.${toBase64Url(
    JSON.stringify({ sub: subject, email: `${subject}@example.test`, exp: expiresAt }),
  )}.signature`
}

function createState(subject: string | null): ConvexAuthCoordinatorState {
  return {
    token: ref(subject ? makeJwt(subject) : null),
    user: ref(subject ? { id: subject, email: `${subject}@example.test` } : null),
    pending: ref(subject === null),
    authError: ref<string | null>(null),
  }
}

function createConfirmingConvexClient(): ConvexClient {
  return {
    setAuth: (
      fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
      onChange: (isAuthenticated: boolean) => void,
    ) => {
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

function attachFakeOwner(port: AuthIdentityPort): void {
  let generation = port.snapshot().identityGeneration
  port.subscribe(() => {
    const snapshot = port.snapshot()
    if (snapshot.identityGeneration === generation) return
    generation = snapshot.identityGeneration
    void port.initializePrimary(createConfirmingConvexClient(), snapshot.authEpoch)
  })
}

function attachCoordinator(coordinator: ConvexAuthCoordinator): void {
  attachFakeOwner(coordinator.port)
  coordinator.attachPrimary(createConfirmingConvexClient())
}

type TokenResult = {
  data: { token: string } | null
  error: unknown
}

type IntegratedEmail = (input: { operation: 'first' | 'second' }) => Promise<unknown>

const coordinators: ConvexAuthCoordinator[] = []

function track(coordinator: ConvexAuthCoordinator): ConvexAuthCoordinator {
  coordinators.push(coordinator)
  return coordinator
}

afterEach(() => {
  for (const coordinator of coordinators.splice(0)) coordinator.dispose()
  vi.restoreAllMocks()
})

describe('client auth characterization: operation ordering', () => {
  it('starts concurrent underlying sign-ins before the coordinator queue and settles by completion order', async () => {
    const firstGate = createDeferred<undefined>()
    const secondGate = createDeferred<undefined>()
    const events: string[] = []
    const settled: string[] = []

    const authClient = {
      convex: {
        token: async (): Promise<TokenResult> => {
          events.push('exchange')
          return { data: { token: makeJwt('A') }, error: null }
        },
      },
      signIn: {
        email: async ({ operation }: { operation: 'first' | 'second' }) => {
          events.push(`${operation}:start`)
          await (operation === 'first' ? firstGate.promise : secondGate.promise)
          events.push(`${operation}:complete`)
          return { data: { token: `better-auth-${operation}` }, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex

    const coordinator = track(createConvexAuthCoordinator({ authClient, state: createState('A') }))
    attachCoordinator(coordinator)
    const email = (coordinator.integratedSignIn as { email: IntegratedEmail }).email

    const first = email({ operation: 'first' }).then(() => settled.push('first'))
    const second = email({ operation: 'second' }).then(() => settled.push('second'))

    // Both Better Auth HTTP operations have started even though neither has
    // reached synchronizeIdentity(), which is the only queued portion.
    expect(events).toEqual(['first:start', 'second:start'])
    expect(coordinator.isPending.value).toBe(false)

    secondGate.resolve(undefined)
    await vi.waitFor(() => expect(settled).toEqual(['second']))
    expect(events).toEqual(['first:start', 'second:start', 'second:complete', 'exchange'])

    firstGate.resolve(undefined)
    await Promise.all([first, second])

    expect(settled).toEqual(['second', 'first'])
    expect(events).toEqual([
      'first:start',
      'second:start',
      'second:complete',
      'exchange',
      'first:complete',
      'exchange',
    ])
  })

  it('does not report pending while the underlying Better Auth request is in flight', async () => {
    const authRequest = createDeferred<undefined>()
    const tokenExchange = createDeferred<TokenResult>()
    const exchangeStarted = vi.fn()

    const authClient = {
      convex: {
        token: async (): Promise<TokenResult> => {
          exchangeStarted()
          return tokenExchange.promise
        },
      },
      signIn: {
        email: async () => {
          await authRequest.promise
          return { data: { token: 'better-auth-session' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => ({ data: { success: true }, error: null }),
    } as unknown as AuthClientWithConvex

    const coordinator = track(createConvexAuthCoordinator({ authClient, state: createState('A') }))
    attachCoordinator(coordinator)
    const email = (coordinator.integratedSignIn as { email: () => Promise<unknown> }).email

    const signingIn = email()
    expect(coordinator.isPending.value).toBe(false)
    expect(exchangeStarted).not.toHaveBeenCalled()

    authRequest.resolve(undefined)
    await vi.waitFor(() => expect(exchangeStarted).toHaveBeenCalledOnce())
    expect(coordinator.isPending.value).toBe(true)

    tokenExchange.resolve({ data: { token: makeJwt('A') }, error: null })
    await signingIn
    expect(coordinator.isPending.value).toBe(false)
  })

  it('can finish sign-in after a later sign-out and restore an authenticated session', async () => {
    const finishSignIn = createDeferred<undefined>()
    let sessionSubject: string | null = 'A'

    const authClient = {
      convex: {
        token: async (): Promise<TokenResult> => ({
          data: sessionSubject ? { token: makeJwt(sessionSubject) } : null,
          error: null,
        }),
      },
      signIn: {
        email: async () => {
          await finishSignIn.promise
          sessionSubject = 'B'
          return { data: { token: 'better-auth-session-B' }, error: null }
        },
      },
      signUp: {},
      signOut: async () => {
        sessionSubject = null
        return { data: { success: true }, error: null }
      },
    } as unknown as AuthClientWithConvex

    const state = createState('A')
    const coordinator = track(createConvexAuthCoordinator({ authClient, state }))
    attachCoordinator(coordinator)
    const email = (coordinator.integratedSignIn as { email: () => Promise<unknown> }).email

    const signingIn = email()
    await coordinator.signOut()
    expect(coordinator.status.value).toBe('anonymous')

    finishSignIn.resolve(undefined)
    await signingIn

    // The user invoked sign-out last, but the earlier unqueued sign-in response
    // completed afterward and re-established B in both the fake server and Convex.
    expect(sessionSubject).toBe('B')
    expect(coordinator.status.value).toBe('authenticated')
    expect((state.user.value as { id: string }).id).toBe('B')
  })
})

type BetterAuthExperimentClient = AuthClientWithConvex & {
  twoFactor: {
    verifyOtp(input: { code: string }): Promise<{
      data: { token: string; user: { id: string } } | null
      error: unknown
    }>
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createRealBetterAuthClient(initialSubject: string | null): {
  authClient: BetterAuthExperimentClient
  requests: string[]
} {
  let sessionSubject = initialSubject
  const requests: string[] = []
  const customFetchImpl: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = new URL(rawUrl).pathname
    requests.push(path)

    if (path.endsWith('/two-factor/verify-otp')) {
      sessionSubject = 'B'
      return jsonResponse({ token: 'better-auth-session-B', user: { id: 'B' } })
    }
    if (path.endsWith('/sign-out')) {
      sessionSubject = null
      return jsonResponse({ success: true })
    }
    if (path.endsWith('/convex/token')) {
      return sessionSubject
        ? jsonResponse({ token: makeJwt(sessionSubject) })
        : jsonResponse({ code: 'UNAUTHORIZED', message: 'No session' }, 401)
    }
    throw new Error(`Unexpected Better Auth request: ${path} (${init?.method ?? 'GET'})`)
  }

  const authClient = createAuthClient({
    baseURL: 'https://app.example.test/api/auth',
    plugins: [convexClient(), twoFactorClient()],
    fetchOptions: { customFetchImpl },
  }) as unknown as BetterAuthExperimentClient

  return { authClient, requests }
}

function observeSessionSignal(authClient: BetterAuthExperimentClient): boolean[] {
  const values: boolean[] = []
  authClient.$store.listen('$sessionSignal', (value) => values.push(value))
  return values
}

describe('client auth characterization: Better Auth 1.6.23 session signals', () => {
  it('completes 2FA through a top-level plugin route and signals without reconciling Convex', async () => {
    const twoFactor = twoFactorClient()
    const sessionListener = twoFactor.atomListeners[0]!
    expect(sessionListener.signal).toBe('$sessionSignal')
    expect(
      ['/two-factor/verify-otp', '/two-factor/verify-totp', '/two-factor/verify-backup-code'].every(
        (path) => sessionListener.matcher(path),
      ),
    ).toBe(true)

    const { authClient, requests } = createRealBetterAuthClient(null)
    const state = createState(null)
    const coordinator = track(createConvexAuthCoordinator({ authClient, state }))
    attachCoordinator(coordinator)
    await coordinator.ready({ timeoutMs: 0 })
    expect(coordinator.status.value).toBe('anonymous')

    const signalValues = observeSessionSignal(authClient)
    const result = await authClient.twoFactor.verifyOtp({ code: '123456' })

    expect(result.error).toBeNull()
    expect(result.data?.token).toBe('better-auth-session-B')
    expect(requests).toContain('/api/auth/two-factor/verify-otp')
    expect(requests.some((path) => path.includes('/sign-in/'))).toBe(false)
    expect(requests.some((path) => path.includes('/sign-up/'))).toBe(false)

    // Better Auth's two-factor client registers /two-factor/* against
    // $sessionSignal and toggles it 10ms after a successful response.
    await vi.waitFor(() => expect(signalValues).toEqual([false, true]))

    const directExchange = await authClient.convex.token({ fetchOptions: { throw: false } })
    expect(directExchange.data?.token).toBeTypeOf('string')

    // Better Auth and its Convex-token endpoint now see B, while this library's
    // coordinator remains anonymous because it does not consume the signal.
    expect(coordinator.status.value).toBe('anonymous')
    expect(state.token.value).toBeNull()
    expect(state.user.value).toBeNull()
  })

  it('leaves the coordinator authenticated after raw Better Auth signOut signals logout', async () => {
    const { authClient, requests } = createRealBetterAuthClient('A')
    const state = createState('A')
    const coordinator = track(createConvexAuthCoordinator({ authClient, state }))
    attachCoordinator(coordinator)
    expect(coordinator.status.value).toBe('authenticated')

    const signalValues = observeSessionSignal(authClient)
    await authClient.signOut()

    expect(requests).toContain('/api/auth/sign-out')
    await vi.waitFor(() => expect(signalValues).toEqual([false, true]))

    const directExchange = await authClient.convex.token({ fetchOptions: { throw: false } })
    expect(directExchange.data).toBeNull()
    expect((directExchange.error as { status: number }).status).toBe(401)

    // This is the raw client exposed as useConvexAuth().client. Its canonical
    // session signal changed, but only the library-owned signOut wrapper updates
    // the coordinator.
    expect(coordinator.status.value).toBe('authenticated')
    expect((state.user.value as { id: string }).id).toBe('A')
    expect(state.token.value).toBeTypeOf('string')
  })
})

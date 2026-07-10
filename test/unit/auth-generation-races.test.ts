import type { ConvexClient } from 'convex/browser'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import type { AuthIdentityPort } from '../../src/runtime/auth/identity-port'

// ---- JWT helpers ---------------------------------------------------------
function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
function makeJwt(sub: string, expOffsetSec = 3600): string {
  const payload = {
    sub,
    email: `${sub}@test`,
    exp: Math.floor(Date.now() / 1000) + expOffsetSec,
  }
  return `${toBase64Url(JSON.stringify({ alg: 'none' }))}.${toBase64Url(JSON.stringify(payload))}.sig`
}
/** A JWT with no subject/user id — decodes to no usable user. */
function makeUserlessJwt(): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + 3600 }
  return `${toBase64Url(JSON.stringify({ alg: 'none' }))}.${toBase64Url(JSON.stringify(payload))}.sig`
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

type TokenResponse = { data?: { token: string } | null; error?: unknown }
type ScriptedResponse = TokenResponse | (() => Promise<TokenResponse>)

// ---- fake owner (mirrors client-owner.attachAuthPort) --------------------
function attachFakeOwner(port: AuthIdentityPort, makeClient: () => ConvexClient) {
  let lastGeneration = port.snapshot().identityGeneration
  port.subscribe(() => {
    const snapshot = port.snapshot()
    if (snapshot.identityGeneration === lastGeneration) return
    lastGeneration = snapshot.identityGeneration
    void port.initializePrimary(makeClient(), snapshot.authEpoch)
  })
}

interface Harness {
  coordinator: ReturnType<typeof createConvexAuthCoordinator>
  state: ConvexAuthCoordinatorState
  pushToken: (token: string) => void
  pushAnonymous: () => void
  pushError: (status: number) => void
  pushScripted: (fn: () => Promise<TokenResponse>) => void
  rejected: Set<string>
  signOutResult: { value: TokenResponse | (() => Promise<TokenResponse>) }
  subject: () => string
  settle: () => Promise<unknown>
  signInTriggering: () => Promise<unknown>
  signOut: () => Promise<unknown>
  refresh: () => Promise<void>
  suppressConfirmations: (suppress: boolean) => void
}

function createHarness(options: { initial?: ScriptedResponse } = {}): Harness {
  const state: ConvexAuthCoordinatorState = {
    token: ref<string | null>(null),
    user: ref(null),
    pending: ref(true),
    authError: ref<string | null>(null),
  }
  const rejected = new Set<string>()
  let confirmationsSuppressed = false
  const responses: ScriptedResponse[] = []
  if (options.initial) responses.push(options.initial)

  const signOutResult: Harness['signOutResult'] = {
    value: { data: { token: '' }, error: null } as TokenResponse,
  }

  const authClient = {
    convex: {
      token: async (): Promise<TokenResponse> => {
        const next = responses.shift() ?? { data: null, error: null }
        return typeof next === 'function' ? await next() : next
      },
    },
    signOut: async (): Promise<TokenResponse> => {
      const value = signOutResult.value
      return typeof value === 'function' ? await value() : value
    },
    signIn: {
      email: async () => ({ data: { token: 'trigger' }, error: null }),
    },
    signUp: {
      email: async () => ({ data: { token: 'trigger' }, error: null }),
    },
  } as unknown as AuthClientWithConvex

  const coordinator = createConvexAuthCoordinator({ authClient, state })

  const makeClient = (): ConvexClient =>
    ({
      setAuth: (
        fetcher: (opts: { forceRefreshToken: boolean }) => Promise<string | null>,
        onChange: (isAuthenticated: boolean) => void,
      ) => {
        void Promise.resolve(fetcher({ forceRefreshToken: false })).then((token) => {
          if (confirmationsSuppressed) return
          onChange(Boolean(token) && !rejected.has(token as string))
        })
      },
      query: async () => ({}),
      mutation: async () => ({}),
      action: async () => ({}),
      onUpdate: () => () => {},
      connectionState: () => ({}),
      subscribeToConnectionState: () => () => {},
      close: async () => {},
    }) as unknown as ConvexClient

  attachFakeOwner(coordinator.port, makeClient)
  coordinator.attachPrimary(makeClient())

  return {
    coordinator,
    state,
    pushToken: (token) => responses.push({ data: { token }, error: null }),
    pushAnonymous: () => responses.push({ data: null, error: null }),
    pushError: (status) => responses.push({ error: { status, message: `HTTP ${status}` } }),
    pushScripted: (fn) => responses.push(fn),
    rejected,
    signOutResult,
    subject: () => (state.user.value ? (state.user.value as { id: string }).id : 'anonymous'),
    settle: () => coordinator.ready({ timeoutMs: 0 }),
    signInTriggering: () =>
      coordinator
        .wrapNamespace({
          email: async () => ({ data: { token: 'trigger' }, error: null }),
        })
        .email(),
    signOut: () => coordinator.signOut(),
    refresh: () => coordinator.refresh(),
    suppressConfirmations: (suppress) => {
      confirmationsSuppressed = suppress
    },
  }
}

describe('auth coordinator generation races (vNext §5.3)', () => {
  it('loading → authenticated on initial settlement (SSR-less)', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    expect(h.subject()).toBe('A')
    expect(h.coordinator.status.value).toBe('authenticated')
  })

  it('settles an identity operation when disposed during candidate confirmation', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    h.suppressConfirmations(true)
    h.pushToken(makeJwt('B'))

    const signingIn = h.signInTriggering()
    await delay(0)
    h.coordinator.dispose()

    await expect(signingIn).resolves.toBeDefined()
  })

  it('settles anonymous with an auth error when primary initialization fails', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    h.suppressConfirmations(true)
    h.pushToken(makeJwt('B'))

    const signingIn = h.signInTriggering()
    await vi.waitFor(() => expect(h.coordinator.port.snapshot().identityGeneration).toBe(1))
    h.coordinator.port.failPrimary(1, new Error('candidate failed'))

    await expect(signingIn).resolves.toBeDefined()
    expect(h.coordinator.status.value).toBe('error')
    expect(h.subject()).toBe('anonymous')
    expect(h.coordinator.error.value?.code).toBeUndefined()
  })

  it('loading → anonymous when there is no session', async () => {
    const h = createHarness({ initial: { data: null, error: null } })
    await h.settle()
    expect(h.subject()).toBe('anonymous')
    expect(h.coordinator.status.value).toBe('anonymous')
  })

  it('initial 401 (no session) settles anonymous, not error', async () => {
    // `@convex-dev/better-auth`'s /convex/token returns 401 UNAUTHORIZED for every
    // session-less request, so a definitive 401 is the anonymous state — not an
    // auth error. Surfacing it as error would break every anonymous visitor's
    // default `optional` queries.
    const h = createHarness({
      initial: { error: { status: 401, message: 'no session' } },
    })
    await h.settle()
    expect(h.subject()).toBe('anonymous')
    expect(h.coordinator.status.value).toBe('anonymous')
    expect(h.coordinator.error.value).toBeNull()
  })

  it('failed initial resolution settles error', async () => {
    // A token that decodes without a stable user id is a genuine authentication
    // failure (unusable identity), distinct from the no-session 401 above.
    const h = createHarness({
      initial: { data: { token: makeUserlessJwt() }, error: null },
    })
    await h.settle()
    expect(h.subject()).toBe('anonymous')
    expect(h.coordinator.status.value).toBe('error')
    expect(h.coordinator.error.value).not.toBeNull()
  })

  it('anonymous → authenticated through integrated sign-in', async () => {
    const h = createHarness({ initial: { data: null, error: null } })
    await h.settle()
    h.pushToken(makeJwt('A'))
    await h.signInTriggering()
    expect(h.subject()).toBe('A')
    expect(h.coordinator.status.value).toBe('authenticated')
  })

  it('concurrent sign-ins execute serially; the last candidate wins', async () => {
    const h = createHarness({ initial: { data: null, error: null } })
    await h.settle()
    h.pushToken(makeJwt('A'))
    h.pushToken(makeJwt('B'))
    const first = h.signInTriggering()
    const second = h.signInTriggering()
    await Promise.all([first, second])
    expect(h.subject()).toBe('B')
  })

  it('direct A → B advances identityGeneration once and publishes B', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    const genBefore = h.coordinator.port.snapshot().identityGeneration
    h.pushToken(makeJwt('B'))
    await h.signInTriggering()
    expect(h.subject()).toBe('B')
    // Effect count (internal §17.2): the generation delta of exactly 1 IS the
    // publish count — identityGeneration increments once per published
    // identity transition, so +1 proves exactly one A→B publish occurred.
    expect(h.coordinator.port.snapshot().identityGeneration).toBe(genBefore + 1)
  })

  it('deferred refresh cannot commit across a completing sign-out (decision 3)', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    // A deliberately-slow background refresh returning a fresh-A token.
    h.pushScripted(async () => {
      await delay(40)
      return { data: { token: makeJwt('A') }, error: null }
    })
    const refreshing = h.refresh()
    // A completing sign-out advances authEpoch at dequeue and goes anonymous.
    await h.signOut()
    expect(h.subject()).toBe('anonymous')
    await refreshing
    // The stale refresh's fresh-A result was discarded.
    expect(h.subject()).toBe('anonymous')
  })

  it('sign-out then refresh stays anonymous', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    await h.signOut()
    expect(h.subject()).toBe('anonymous')
    h.pushAnonymous()
    await h.refresh()
    expect(h.subject()).toBe('anonymous')
  })

  it('definitive 401 on refresh clears identity and transitions to anonymous', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    h.pushError(401)
    await h.refresh()
    expect(h.subject()).toBe('anonymous')
    expect(h.state.token.value).toBeNull()
  })

  it('token revocation (onChange false) transitions to anonymous', async () => {
    const revokedA = makeJwt('A', 7200)
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    // Next refresh returns a rotated token that Convex will reject.
    h.rejected.add(revokedA)
    h.pushToken(revokedA)
    await h.refresh()
    expect(h.subject()).toBe('anonymous')
  })

  it('transient transport failure over a usable identity stays authenticated with error', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    // A transient failure persists across the bounded retry loop (MAX_FETCH_ATTEMPTS).
    for (let i = 0; i < 4; i += 1) h.pushError(503)
    await h.refresh()
    expect(h.subject()).toBe('A')
    expect(h.coordinator.status.value).toBe('authenticated')
    expect(h.coordinator.error.value).not.toBeNull()
  })

  it('a token without a stable user id is an authentication error, never installed', async () => {
    const h = createHarness({ initial: { data: null, error: null } })
    await h.settle()
    h.pushScripted(async () => ({
      data: { token: makeUserlessJwt() },
      error: null,
    }))
    await h.signInTriggering()
    expect(h.subject()).toBe('anonymous')
    expect(h.state.token.value).toBeNull()
    expect(h.coordinator.error.value).not.toBeNull()
  })

  it('same-user token rotation bumps authEpoch but not identityGeneration', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    const genBefore = h.coordinator.port.snapshot().identityGeneration
    const epochBefore = h.coordinator.port.snapshot().authEpoch
    h.pushToken(makeJwt('A', 7200))
    await h.refresh()
    expect(h.subject()).toBe('A')
    expect(h.coordinator.port.snapshot().identityGeneration).toBe(genBefore)
    expect(h.coordinator.port.snapshot().authEpoch).toBeGreaterThan(epochBefore)
  })

  it('error → authenticated through a successful sign-in without a preliminary refresh', async () => {
    const h = createHarness({
      initial: { data: { token: makeUserlessJwt() }, error: null },
    })
    await h.settle()
    expect(h.coordinator.status.value).toBe('error')
    h.pushToken(makeJwt('A'))
    // Sign-in directly from `error`, with no intervening refresh() call.
    await h.signInTriggering()
    expect(h.coordinator.status.value).toBe('authenticated')
    expect(h.subject()).toBe('A')
  })

  it('error → anonymous through a later successful anonymous settlement (refresh)', async () => {
    const h = createHarness({
      initial: { data: { token: makeUserlessJwt() }, error: null },
    })
    await h.settle()
    expect(h.coordinator.status.value).toBe('error')
    h.pushAnonymous()
    await h.refresh()
    expect(h.coordinator.status.value).toBe('anonymous')
    expect(h.coordinator.error.value).toBeNull()
  })

  it('teardown while an operation is pending does not throw or resurrect state', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    h.pushScripted(async () => {
      await delay(30)
      return { data: { token: makeJwt('A', 7200) }, error: null }
    })
    const refreshing = h.refresh()
    h.coordinator.dispose()
    await expect(refreshing).resolves.toBeUndefined()
  })
})

describe('ready() snapshot semantics (vNext §5.3/§6.4)', () => {
  it('resolves immediately with the current status once settled and no refresh is active', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    const status = await h.coordinator.ready({ timeoutMs: 0 })
    expect(status).toBe('authenticated')
  })

  it('does not chase a refresh that starts after the call', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    const readyPromise = h.coordinator.ready({ timeoutMs: 0 })
    // A refresh started AFTER `ready()` was called must not be awaited by it.
    h.pushScripted(async () => {
      await delay(30)
      return { data: { token: makeJwt('A', 7200) }, error: null }
    })
    const lateRefresh = h.refresh()
    const status = await readyPromise
    expect(status).toBe('authenticated')
    await lateRefresh
  })

  it('waits for the refresh that was already active when called, then returns current status', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    h.pushScripted(async () => {
      await delay(20)
      return { data: null, error: null }
    })
    const refreshing = h.refresh()
    const status = await h.coordinator.ready({ timeoutMs: 0 })
    await refreshing
    expect(status).toBe('anonymous')
  })

  it('a timeout returns the current status and never rejects', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    h.pushScripted(async () => {
      await delay(200)
      return { data: { token: makeJwt('A', 7200) }, error: null }
    })
    const refreshing = h.refresh()
    const status = await h.coordinator.ready({ timeoutMs: 5 })
    // The refresh had not settled within the 5ms deadline; ready() returned the
    // still-current status without waiting for it and without rejecting.
    expect(status).toBe('authenticated')
    await refreshing
  })

  it('treats timeoutMs: 0 as no timeout (awaits the captured work to completion)', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    h.pushScripted(async () => {
      await delay(15)
      return { data: null, error: null }
    })
    const refreshing = h.refresh()
    const status = await h.coordinator.ready({ timeoutMs: 0 })
    expect(status).toBe('anonymous')
    await refreshing
  })

  it('does not independently wait for a concurrent sign-in unless its refresh was captured', async () => {
    const h = createHarness({
      initial: { data: { token: makeJwt('A') }, error: null },
    })
    await h.settle()
    // `ready()` with no active refresh resolves immediately even while an
    // unrelated identity-queue operation (sign-in) is in flight.
    h.pushScripted(async () => {
      await delay(30)
      return { data: { token: makeJwt('B'), error: null } }
    })
    const signingIn = h.signInTriggering()
    const status = await h.coordinator.ready({ timeoutMs: 0 })
    expect(status).toBe('authenticated') // still A; sign-in hadn't committed yet
    await signingIn
  })
})

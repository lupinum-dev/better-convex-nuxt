import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useState } from '#imports'

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
import { MockConvexClient } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

/**
 * Integration test for the REAL auth coordinator wired to the REAL client owner
 * ("per-app auth context and pure transitions" + architecture invariant
 * structural cross-user isolation). current implementation's owner/query ports are reviewers
 * here (`test/unit/client-owner.test.ts` already covers owner mechanics against
 * a synthetic port) — this test proves current implementation's coordinator drives the REAL
 * owner correctly end to end: sign-out lifecycle, client retirement, payload
 * purge, and two-app isolation.
 */

// ---- JWT helpers (mirrors test/unit/auth-generation-races.test.ts) ---------
function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
function makeJwt(sub: string, expOffsetSec = 3600): string {
  const payload = { sub, email: `${sub}@test`, exp: Math.floor(Date.now() / 1000) + expOffsetSec }
  return `${toBase64Url(JSON.stringify({ alg: 'none' }))}.${toBase64Url(JSON.stringify(payload))}.sig`
}

/** Counting ConvexClient double: records close()/setAuth() (architecture invariant). */
class CountingClient extends MockConvexClient {
  static created = 0
  static closed = 0
  closeCalls = 0
  rejectedTokens: Set<string>

  constructor(rejectedTokens: Set<string> = new Set()) {
    super()
    this.rejectedTokens = rejectedTokens
    CountingClient.created += 1
  }

  close = async (): Promise<void> => {
    this.closeCalls += 1
    CountingClient.closed += 1
  }

  setAuth = (
    fetcher: (opts: { forceRefreshToken: boolean }) => Promise<string | null>,
    onChange: (isAuthenticated: boolean) => void,
  ): void => {
    void Promise.resolve(fetcher({ forceRefreshToken: false })).then((token) => {
      onChange(Boolean(token) && !this.rejectedTokens.has(token as string))
    })
  }
}

function resetCounts() {
  CountingClient.created = 0
  CountingClient.closed = 0
}

type TokenResponse = { data?: { token: string } | null; error?: unknown }

interface SignOutScript {
  value: TokenResponse
}

function buildHarness(pendingRef: { value: boolean }, initial?: TokenResponse) {
  resetCounts()
  const responses: TokenResponse[] = []
  // `attachPrimary`'s no-hydration path calls `authClient.convex.token()`
  // SYNCHRONOUSLY (no leading await inside the mock), so any initial token must
  // be queued BEFORE the coordinator is constructed below, not after.
  if (initial) responses.push(initial)
  const rejected = new Set<string>()
  const signOutScript: SignOutScript = { value: { data: { token: '' }, error: null } }
  let reconcileObservedSession: ((sessionToken: string | null) => void) | null = null

  const authClient = {
    convex: {
      token: async (): Promise<TokenResponse> => responses.shift() ?? { data: null, error: null },
    },
    signOut: async (): Promise<TokenResponse> => {
      const result = signOutScript.value
      if (!result.error) {
        setTimeout(() => reconcileObservedSession?.(null), 0)
      }
      return result
    },
    signIn: { email: async () => ({ data: { token: 'trigger' }, error: null }) },
    signUp: { email: async () => ({ data: { token: 'trigger' }, error: null }) },
  } as unknown as AuthClientWithConvex

  const owner = createConvexClientOwner({
    primaryFactory: () => new CountingClient(rejected) as unknown as OwnedConvexClient,
    anonymousFactory: () => new CountingClient(rejected) as unknown as OwnedConvexClient,
  })

  const state: ConvexAuthCoordinatorState = {
    identity: ref(LOADING_IDENTITY),
    pending: pendingRef as ConvexAuthCoordinatorState['pending'],
    authError: ref<string | null>(null),
  }

  const purged: string[] = []
  const coordinator = createConvexAuthCoordinator({
    authClient,
    state,
    purgeIdentityPayloads: () => {
      purged.push('purged')
    },
  })
  reconcileObservedSession = (sessionToken) => {
    void coordinator.reconcileSession(sessionToken)
  }

  owner.attachAuthPort(coordinator.port)
  coordinator.attachPrimary(
    owner.getPrimary()!.client as unknown as import('convex/browser').ConvexClient,
  )

  return {
    owner,
    coordinator,
    signOutScript,
    pushToken: (token: string) => responses.push({ data: { token }, error: null }),
    pushAnonymous: () => responses.push({ data: null, error: null }),
    purged,
    rejected,
    settle: () => coordinator.ready({ timeoutMs: 0 }),
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('client-engine sign-out lifecycle (real coordinator + real owner)', () => {
  it('sign-out clears identity and purges identity-owned payloads', async () => {
    const { result: harness, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        pending.value = true
        return buildHarness(pending, { data: { token: makeJwt('A') }, error: null })
      },
      { convexConfig: { auth: {} } },
    )

    await harness.settle()
    expect(harness.coordinator.user.value).toEqual(expect.objectContaining({ id: 'A' }))
    expect(harness.coordinator.status.value).toBe('authenticated')

    await harness.coordinator.signOut()
    expect(harness.purged.length).toBeGreaterThan(0)
    expect(harness.coordinator.user.value).toBeNull()
    expect(harness.coordinator.token.value).toBeNull()
    expect(harness.coordinator.status.value).toBe('anonymous')

    wrapper.unmount()
  })

  it('sign-out retires (closes) the prior authenticated primary client', async () => {
    const { result: harness, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        pending.value = true
        return buildHarness(pending, { data: { token: makeJwt('A') }, error: null })
      },
      { convexConfig: { auth: {} } },
    )

    await harness.settle()
    expect(harness.coordinator.status.value).toBe('authenticated')

    const closedBeforeSignOut = CountingClient.closed
    await harness.coordinator.signOut()
    // A→anonymous is a stable identity-key change: the prior authenticated
    // primary is retired (architecture invariant "close the previous primary client").
    expect(CountingClient.closed).toBeGreaterThan(closedBeforeSignOut)

    wrapper.unmount()
  })

  it('failed sign-out retains the existing identity under the newer auth epoch', async () => {
    const tokenA = makeJwt('A')
    const { result: harness, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        pending.value = true
        return buildHarness(pending, { data: { token: tokenA }, error: null })
      },
      { convexConfig: { auth: {} } },
    )

    await harness.settle()
    const epochBefore = harness.coordinator.port.snapshot().authEpoch

    harness.signOutScript.value = { error: { message: 'network down' } }
    // Recovery retains A only after one fresh Better Auth token verdict proves
    // that the failed operation did not partially remove the session.
    harness.pushToken(tokenA)
    await expect(harness.coordinator.signOut()).rejects.toThrow()

    // Identity A is retained; authEpoch advanced at dequeue regardless of outcome.
    expect(harness.coordinator.user.value).toEqual(expect.objectContaining({ id: 'A' }))
    expect(harness.coordinator.status.value).toBe('authenticated')
    expect(harness.coordinator.port.snapshot().authEpoch).toBeGreaterThan(epochBefore)

    wrapper.unmount()
  })

  it('two Nuxt applications in one process have isolated coordinators and owners', async () => {
    const appA = buildHarness({ value: true }, { data: { token: makeJwt('A') }, error: null })
    const appB = buildHarness({ value: true }, { data: { token: makeJwt('B') }, error: null })

    await Promise.all([appA.settle(), appB.settle()])

    expect(appA.coordinator.user.value).toEqual(expect.objectContaining({ id: 'A' }))
    expect(appB.coordinator.user.value).toEqual(expect.objectContaining({ id: 'B' }))

    await appA.coordinator.signOut()
    expect(appA.coordinator.user.value).toBeNull()
    // B is fully unaffected by A's sign-out (isolated per-app coordinator/owner).
    expect(appB.coordinator.user.value).toEqual(expect.objectContaining({ id: 'B' }))
  })
})

import type { ConvexClient } from 'convex/browser'
import { watch, type Ref } from 'vue'

import { ConvexCallError } from '../errors'
import { getConvexIdentityKey, type ConvexIdentityKey } from '../utils/identity-key'
import type { ConvexUser } from '../utils/types'

// Re-export the real framework-free class (vNext §7, decision 8) so existing
// consumers keep importing `ConvexCallError` from this port. Phase 1's
// placeholder interface is retired; the adapter below now publishes real
// instances. Constructing an `authentication` instance requires the class value,
// which `scripts/check-boundaries.mjs` confirms is a legal browser-runtime →
// `/errors` edge.
export { ConvexCallError }

/**
 * The frozen private auth port consumed by query gating and client replacement
 * (internal §7.2).
 *
 * Phase 1 adapts the existing auth engine to this port; Phase 3 replaces only the
 * adapter/provider with the final auth coordinator without redesigning query or
 * client-owner code. The adapter is the SOLE publisher of `authEpoch` and
 * `identityGeneration`; the legacy engine's internal `authGeneration` never
 * crosses this boundary, and no query or client-owner code may read engine state
 * except through this port.
 */
export interface AuthIdentityPort {
  snapshot(): AuthIdentitySnapshot
  waitForInitialSettlement(): Promise<void>
  subscribe(listener: () => void): () => void
  initializePrimary(candidate: ConvexClient, authEpoch: number): Promise<void>
}

export interface AuthIdentitySnapshot {
  authEnabled: boolean
  settled: boolean
  identityKey: ConvexIdentityKey | null
  /** Monotonic; invalidates stale auth-operation work. Same-user rotation bumps this. */
  authEpoch: number
  /** Monotonic; changes only when the stable identity key changes. */
  identityGeneration: number
  /** Non-null only when initial resolution failed without usable identity. */
  error: ConvexCallError | null
}

/**
 * The minimal engine surface the Phase 1 adapter drives. The existing
 * `ConvexAuthEngine` satisfies this; the port intentionally depends on this
 * narrow shape rather than the whole engine so Phase 3 can swap the provider.
 */
export interface AuthPortEngine {
  attachConvexClient: (client: ConvexClient) => void
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
}

export interface AuthPortReactiveState {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  /** `true` while initial auth is unresolved (engine-private `hasResolvedInitialAuth`). */
  pending: Ref<boolean>
  authError: Ref<string | null>
}

/**
 * Build the disabled auth port. It contains no application state, exposes a frozen
 * `disabled` snapshot, never settles late, and imports no Better Auth runtime.
 */
export function createDisabledAuthIdentityPort(): AuthIdentityPort {
  const snapshot: AuthIdentitySnapshot = Object.freeze({
    authEnabled: false,
    settled: true,
    identityKey: null,
    authEpoch: 0,
    identityGeneration: 0,
    error: null,
  })
  return {
    snapshot: () => snapshot,
    waitForInitialSettlement: () => Promise.resolve(),
    subscribe: () => () => {},
    initializePrimary: () => Promise.resolve(),
  }
}

/**
 * Phase 1 adapter mapping the existing engine's `hasResolvedInitialAuth` /
 * `convex:pending` / `convex:user` / `convex:authError` state into the canonical
 * status and identity key, and publishing the two counters.
 *
 * Counter semantics (vNext §5.3/§5.4):
 * - `authEpoch` advances on any observable token change while settled, including
 *   same-user token rotation.
 * - `identityGeneration` advances only when the stable identity key changes.
 */
export function createEngineAuthIdentityPort(input: {
  engine: AuthPortEngine
  state: AuthPortReactiveState
}): AuthIdentityPort {
  const { engine, state } = input

  let authEpoch = 0
  let identityGeneration = 0
  let lastToken = state.token.value
  let lastIdentityKey = safeIdentityKey(state.user.value)

  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  const settlementWaiters = new Set<() => void>()
  const resolveSettlement = () => {
    for (const resolve of [...settlementWaiters]) resolve()
    settlementWaiters.clear()
  }

  // Publish counters as the sole owner. Token change => authEpoch; identity-key
  // change => identityGeneration (which also implies a new epoch). The watcher is
  // app-lived; Phase 3 attaches its stop handle to the runtime disposer.
  watch(
    [state.token, state.user, state.pending, state.authError],
    () => {
      const nextIdentityKey = safeIdentityKey(state.user.value)
      const identityChanged = nextIdentityKey !== lastIdentityKey
      const tokenChanged = state.token.value !== lastToken

      if (identityChanged) {
        identityGeneration += 1
        authEpoch += 1
      } else if (tokenChanged) {
        authEpoch += 1
      }

      lastIdentityKey = nextIdentityKey
      lastToken = state.token.value

      if (!state.pending.value) resolveSettlement()
      notify()
    },
    { flush: 'sync' },
  )

  const snapshot = (): AuthIdentitySnapshot => {
    const settled = !state.pending.value
    const identityKey = settled ? safeIdentityKey(state.user.value) : null
    // Port error is present ONLY when initial resolution failed without usable
    // identity — a background-refresh error over a usable identity is not it.
    const hasUsableIdentity = identityKey !== null && identityKey !== 'anonymous'
    const error: ConvexCallError | null =
      settled && !hasUsableIdentity && state.authError.value
        ? new ConvexCallError({ kind: 'authentication', message: state.authError.value })
        : null

    return {
      authEnabled: true,
      settled,
      identityKey,
      authEpoch,
      identityGeneration,
      error,
    }
  }

  return {
    snapshot,
    waitForInitialSettlement() {
      if (!state.pending.value) return Promise.resolve()
      return new Promise<void>((resolve) => {
        settlementWaiters.add(resolve)
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async initializePrimary(candidate) {
      // The client owner (Phase 3 target) supplies a fresh candidate; the engine
      // installs the token fetcher and settles when Convex confirms auth. The
      // owner interprets nothing about tokens — it only awaits this handshake.
      engine.attachConvexClient(candidate)
      await engine.awaitAuthReady()
    },
  }
}

function safeIdentityKey(user: ConvexUser | null): ConvexIdentityKey {
  try {
    return getConvexIdentityKey(user)
  } catch {
    // A token without a valid user id is not a settled identity; treat as anonymous
    // for keying purposes so we never manufacture `user:undefined`.
    return 'anonymous'
  }
}

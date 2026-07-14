import type { ConvexClient } from 'convex/browser'

import type { ConvexCallError } from '../errors'
import type { ConvexIdentityKey } from '../utils/identity-key'

/**
 * The FROZEN private auth port consumed by query gating and client replacement
 * (internal §7.2). Phase 3 replaces the engine BEHIND this port — the interface
 * and its consumers are unchanged. The Phase 3 coordinator
 * ({@link createConvexAuthCoordinator}) is the real publisher of `authEpoch` and
 * `identityGeneration`; no query or client-owner code reads auth state except
 * through this port.
 */
export interface AuthIdentityPort {
  snapshot(): AuthIdentitySnapshot
  waitForInitialSettlement(): Promise<void>
  subscribe(listener: () => void): () => void
  initializePrimary(candidate: ConvexClient): Promise<void>
  failPrimary(identityGeneration: number, error: unknown): void
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
    failPrimary: () => {},
  }
}

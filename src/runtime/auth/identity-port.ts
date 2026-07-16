import type { ConvexClient } from 'convex/browser'

import type { ConvexCallError } from '../errors'
import type { ConvexIdentityKey } from '../utils/identity-key'

/**
 * The FROZEN private auth port consumed by query gating and client replacement
 * (architecture invariant). current implementation replaces the engine BEHIND this port — the interface
 * and its consumers are unchanged. The current implementation coordinator
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

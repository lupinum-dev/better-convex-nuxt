import type { ComputedRef } from 'vue'
import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue'

import { useState } from '#imports'

import type { AuthIdentityPort, ConvexCallError } from '../auth/identity-port'
import type { OwnedConvexClient, ConvexClientOwner } from '../client/client-owner'
import { useConvexAuthPendingState } from './auth-pending-state'
import { deriveConvexAuthStatus, type ConvexAuthStatus } from './auth-status'
import { getConvexIdentityKey, type ConvexIdentityKey } from './identity-key'
import type { QueryExecutionGate } from './query-execution-gate'
import { getConvexRuntimeConfig } from './runtime-config'
import type { ConvexUser } from './types'

/**
 * Reactive canonical auth-identity inputs for query gating and isolation
 * tagging (internal §7.2). This is the single place query composables read auth
 * state; they never touch the auth engine directly.
 *
 * Derived from the SSR-seeded reactive state (`convex:pending` / `convex:user` /
 * `convex:authError`) so it is correct on both server and client, plus the
 * frozen {@link AuthIdentityPort} for the monotonic `identityGeneration` used as
 * the isolation dimension. Auth-disabled and server contexts have no port and
 * report generation `0`.
 */
export interface ConvexQueryAuthContext {
  readonly status: ComputedRef<ConvexAuthStatus>
  readonly identityKey: ComputedRef<ConvexIdentityKey | null>
  readonly identityGeneration: ComputedRef<number>
  readonly error: ComputedRef<ConvexCallError | null>
  /** Resolve when initial auth bootstrap settles (used by the await contract). */
  waitForInitialSettlement(): Promise<void>
}

function safeIdentityKey(user: ConvexUser | null): ConvexIdentityKey {
  try {
    return getConvexIdentityKey(user)
  } catch {
    // A token without a resolved user id is not a settled identity; never
    // manufacture `user:undefined`.
    return 'anonymous'
  }
}

export function createConvexQueryAuthContext(nuxtApp: {
  $convexAuthPort?: AuthIdentityPort
}): ConvexQueryAuthContext {
  const authEnabled = getConvexRuntimeConfig().auth !== false

  const user = useState<ConvexUser | null>('convex:user', () => null)
  const pending = useConvexAuthPendingState()
  const authError = useState<string | null>('convex:authError', () => null)

  const port = authEnabled ? nuxtApp.$convexAuthPort : undefined

  // Mirror the port's monotonic identity generation reactively. Subscribing keeps
  // masking correct across A->B primary replacement even when the identity key
  // alone would repeat (A->B->A). Server/disabled contexts stay at 0.
  const generation = shallowRef(port ? port.snapshot().identityGeneration : 0)
  if (port && getCurrentScope()) {
    const stop = port.subscribe(() => {
      generation.value = port.snapshot().identityGeneration
    })
    onScopeDispose(stop)
  }

  const identityKey = computed<ConvexIdentityKey | null>(() =>
    authEnabled ? safeIdentityKey(user.value) : null,
  )

  const error = computed<ConvexCallError | null>(() => {
    if (!authEnabled) return null
    return authError.value ? { kind: 'authentication', message: authError.value } : null
  })

  const status = computed<ConvexAuthStatus>(() => {
    if (!authEnabled) return 'disabled'
    if (pending.value) return 'loading'
    return deriveConvexAuthStatus({
      authEnabled: true,
      settled: true,
      identityKey: identityKey.value,
      error: error.value,
    })
  })

  return {
    status,
    identityKey,
    identityGeneration: computed(() => generation.value),
    error,
    waitForInitialSettlement() {
      if (port) return port.waitForInitialSettlement()
      return Promise.resolve()
    },
  }
}

/**
 * Select the live/once transport client for a gate decision (internal §7.5).
 *
 * - `none` in an auth-enabled build uses the dedicated anonymous client that
 *   never receives `setAuth` (its identity is never rebound).
 * - `required`/`optional` (and `none` in an auth-disabled build) use the
 *   identity-scoped primary, which the owner replaces on identity change.
 *
 * Returns `null` when no client owner exists (SSR uses HTTP, never a WS client).
 */
export function selectLiveQueryClient(
  owner: ConvexClientOwner | undefined,
  gate: QueryExecutionGate,
): OwnedConvexClient | null {
  if (!owner) return null
  if (gate.useAnonymousClient) return owner.getAnonymous()
  return owner.getPrimary()?.client ?? null
}

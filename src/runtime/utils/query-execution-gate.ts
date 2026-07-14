import type { ConvexAuthMode, ConvexAuthStatus } from './auth-status'
import { isAuthenticatedIdentityKey, type ConvexIdentityKey } from './identity-key'

/**
 * Canonical query execution gate (vNext §6 "Required execution-gate behavior").
 *
 * The gate is driven by the canonical auth status and the stable identity key
 * published by the frozen {@link AuthIdentityPort} adapter — never by raw engine
 * state and never by `isPending`. Background auth work must not idle an already
 * usable identity, so `isPending` is deliberately absent from the input.
 *
 * Decision order (each step returns immediately):
 *   1. Explicit `'skip'` resolves idle.
 *   2. `none` executes without waiting and uses the `anonymous` cache dimension.
 *   3. `disabled`: `required` resolves idle; `optional` executes anonymously
 *      without waiting.
 *   4. `loading`: `required` and `optional` wait for initial auth settlement.
 *   5. `error`: `required` and `optional` surface the auth error without a
 *      network request. They do not silently downgrade to anonymous.
 *   6. `anonymous`: `required` resolves idle; `optional` executes anonymously.
 *   7. `authenticated`: `required` and `optional` require a non-null matching
 *      `user:<id>` key and execute with that identity.
 */
export interface QueryExecutionGateInput {
  authStatus: ConvexAuthStatus
  authMode: ConvexAuthMode
  identityKey: ConvexIdentityKey | null
  skipped: boolean
  subscribe: boolean
}

/**
 * The terminal gate decision (vNext §5.5 terminal-decision contract):
 * - `execute` — issue the network request (live subscription when `subscribe`);
 * - `idle`    — resolve idle with no request and no error;
 * - `wait`    — wait for initial auth settlement, then re-evaluate;
 * - `error`   — surface the settled auth error with no request.
 */
export type QueryExecutionOutcome = 'execute' | 'idle' | 'wait' | 'error'

/** Descriptive reason for a non-executing decision (diagnostics / DevTools). */
export type QueryExecutionReason =
  | 'executing'
  | 'explicit-skip'
  | 'auth-loading'
  | 'auth-error'
  | 'required-idle'

interface QueryExecutionDecisionBase {
  /** The identity dimension for the cache / payload / subscription key. */
  cacheIdentity: ConvexIdentityKey
  reason: QueryExecutionReason
}

export type QueryExecutionGate =
  | (QueryExecutionDecisionBase & { outcome: 'idle' })
  | (QueryExecutionDecisionBase & { outcome: 'wait' })
  | (QueryExecutionDecisionBase & { outcome: 'error' })
  | (QueryExecutionDecisionBase & {
      outcome: 'execute'
      /** Open a live subscription when the caller requested subscriptions. */
      subscribe: boolean
      /** Route through the dedicated never-authenticated client. */
      useAnonymousClient: boolean
    })

const IDLE = {
  outcome: 'idle',
} as const

/**
 * Pure gate. No side effects, no reactivity, no client access — it maps the
 * canonical status + mode + identity key to a terminal decision so the same
 * matrix is trivially unit-testable across all status/mode combinations.
 */
export function createQueryExecutionGate(input: QueryExecutionGateInput): QueryExecutionGate {
  const { authStatus, authMode, identityKey, skipped, subscribe } = input

  // 1. Explicit skip resolves idle regardless of auth.
  if (skipped) {
    return {
      ...IDLE,
      cacheIdentity: identityDimension(authMode, identityKey),
      reason: 'explicit-skip',
    }
  }

  // 2. `none` never inspects or waits for auth. Anonymous transport + anonymous
  //    cache dimension. Uses the dedicated anonymous client unless the whole
  //    build is auth-disabled (its primary is already anonymous).
  if (authMode === 'none') {
    return {
      outcome: 'execute',
      subscribe,
      useAnonymousClient: authStatus !== 'disabled',
      cacheIdentity: 'anonymous',
      reason: 'executing',
    }
  }

  // 3. Auth disabled: `required` idles, `optional` executes anonymously now.
  if (authStatus === 'disabled') {
    if (authMode === 'required') {
      return { ...IDLE, cacheIdentity: 'anonymous', reason: 'required-idle' }
    }
    return executeAnonymously(subscribe)
  }

  // 4. Loading: both required and optional wait for initial settlement.
  if (authStatus === 'loading') {
    return {
      outcome: 'wait',
      cacheIdentity: identityDimension(authMode, identityKey),
      reason: 'auth-loading',
    }
  }

  // 5. Error: surface the settled auth error; never downgrade to anonymous.
  if (authStatus === 'error') {
    return {
      outcome: 'error',
      cacheIdentity: identityDimension(authMode, identityKey),
      reason: 'auth-error',
    }
  }

  // 6. Anonymous: `required` idles, `optional` executes anonymously.
  if (authStatus === 'anonymous') {
    if (authMode === 'required') {
      return { ...IDLE, cacheIdentity: 'anonymous', reason: 'required-idle' }
    }
    return executeAnonymously(subscribe)
  }

  // 7. Authenticated: both modes require a concrete matching `user:<id>` key.
  //    A settled 'authenticated' status always carries such a key; guard the
  //    inconsistent case (no usable id) by waiting rather than manufacturing a
  //    `user:undefined` identity (vNext §5.4).
  if (!isAuthenticatedIdentityKey(identityKey)) {
    return {
      outcome: 'wait',
      cacheIdentity: 'anonymous',
      reason: 'auth-loading',
    }
  }

  return {
    outcome: 'execute',
    subscribe,
    useAnonymousClient: false,
    cacheIdentity: identityKey,
    reason: 'executing',
  }
}

function executeAnonymously(subscribe: boolean): QueryExecutionGate {
  return {
    outcome: 'execute',
    subscribe,
    useAnonymousClient: false,
    cacheIdentity: 'anonymous',
    reason: 'executing',
  }
}

/**
 * The cache dimension for a non-`none` query. `none` always keys under
 * `anonymous`; every other mode keys under the concrete authenticated subject
 * when one exists and `anonymous` otherwise.
 */
function identityDimension(
  authMode: ConvexAuthMode,
  identityKey: ConvexIdentityKey | null,
): ConvexIdentityKey {
  if (authMode === 'none') return 'anonymous'
  return isAuthenticatedIdentityKey(identityKey) ? identityKey : 'anonymous'
}

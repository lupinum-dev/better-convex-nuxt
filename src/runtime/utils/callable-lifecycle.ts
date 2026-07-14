import type { ComputedRef, Ref } from 'vue'

import {
  createIdentityChangedError,
  isIdentityChangedError,
} from '../client/identity-changed-error'
import type { DevtoolsSink } from '../devtools/sink'
import type { CallResult, ConvexCallError } from '../errors'
import { normalizeConvexError } from '../errors'
import { createConvexCallState } from './call-state'
import type { ConvexCallStatus } from './types'

/**
 * The single private callable lifecycle shared by `useConvexMutation` and
 * `useConvexAction` (internal §8). It owns the entire common algorithm — latest
 * revision, pending/data/error state, callbacks, logging, DevTools events, error
 * normalization, and the throwing / `.safe()` result paths — so neither
 * composable carries its own copy. Only the operation-specific behavior (the
 * actual mutation/action invocation and its optional optimistic update) is
 * injected through {@link CallableLifecycleHandlers.invoke}.
 *
 * It is deliberately unexported from the public surface and never wraps queries,
 * pagination, uploads, or server calls.
 *
 * Every invocation captures the identity generation at start. A completion
 * observed under a changed generation — whether the client owner already
 * rejected it with `IDENTITY_CHANGED` during A→B replacement, or it settled in
 * the brief window before replacement committed — is retired: it never commits
 * data/error, never invokes callbacks, never emits a log, and never publishes a
 * DevTools event under the new identity. The throwing path rejects with
 * `IDENTITY_CHANGED`; `.safe()` returns that normalized error. A stale
 * mutation/action may already have committed remotely and must not be presented
 * as safely retryable.
 */
export interface CallableLifecycleHandlers<Args, Result> {
  /** Perform the operation-specific network call (mutation or action). */
  invoke: (args: Args) => Promise<Result>
  /** Run once when a call starts (e.g. the mutation optimistic-update log). */
  onStart?: (args: Args) => void
  /** User success callback; thrown errors are caught and logged, never rethrown. */
  onSuccess?: (result: Result, args: Args) => void
  /** User error callback; thrown errors are caught and logged, never rethrown. */
  onError?: (error: ConvexCallError, args: Args) => void
  logSuccess?: (args: Args, durationMs: number) => void
  logError?: (args: Args, durationMs: number, error: ConvexCallError) => void
  logCallbackError?: (error: ConvexCallError) => void
}

export interface CallableLifecycleInput<Args, Result> {
  devtoolsKind: 'mutation' | 'action'
  fnName: string
  hasOptimisticUpdate: boolean
  /** Current identity generation from the frozen auth port (0 when auth-disabled). */
  getIdentityGeneration: () => number
  getDevtoolsSink?: () => DevtoolsSink | null
  handlers: CallableLifecycleHandlers<Args, Result>
}

export interface CallableLifecycle<Args, Result> {
  run: (args: Args) => Promise<Result>
  safe: (args: Args) => Promise<CallResult<Result>>
  data: Ref<Result | undefined>
  status: ComputedRef<ConvexCallStatus>
  pending: ComputedRef<boolean>
  error: Ref<ConvexCallError | null>
  reset: () => void
  /**
   * Called by the composable when the auth port notifies of a possible identity
   * change. When the generation actually advanced, retained data/error is masked
   * and any pending call is retired synchronously (internal §8, vNext §5.4).
   */
  onIdentityMaybeChanged: () => void
}

export function createCallableLifecycle<Args, Result>(
  input: CallableLifecycleInput<Args, Result>,
): CallableLifecycle<Args, Result> {
  const {
    devtoolsKind,
    fnName,
    hasOptimisticUpdate,
    getIdentityGeneration,
    getDevtoolsSink,
    handlers,
  } = input

  const callState = createConvexCallState<Result>()
  let lastSeenGeneration = getIdentityGeneration()

  const runCallback = (fn: () => void) => {
    try {
      fn()
    } catch (callbackError) {
      handlers.logCallbackError?.(normalizeConvexError(callbackError))
    }
  }

  const run = async (args: Args): Promise<Result> => {
    const startTime = Date.now()
    const requestId = callState.start()
    const generation = getIdentityGeneration()
    const devtools = getDevtoolsSink?.() ?? null
    const devToolsId = devtools?.registerMutation({
      name: fnName,
      type: devtoolsKind,
      args,
      state: devtoolsKind === 'mutation' && hasOptimisticUpdate ? 'optimistic' : 'pending',
      hasOptimisticUpdate,
      startedAt: startTime,
    })
    handlers.onStart?.(args)

    try {
      const result = await handlers.invoke(args)

      // A result observed under a changed identity generation is stale even if
      // the wire call succeeded (it may have landed on the retired client before
      // replacement committed). Retire it as IDENTITY_CHANGED.
      if (getIdentityGeneration() !== generation) {
        throw createIdentityChangedError(devtoolsKind)
      }

      const committed = callState.commitSuccess(requestId, result)
      if (committed) {
        if (handlers.onSuccess) runCallback(() => handlers.onSuccess!(result, args))
        if (devToolsId) {
          const settledAt = Date.now()
          devtools?.updateMutation(devToolsId, {
            state: 'success',
            result,
            settledAt,
            duration: settledAt - startTime,
          })
        }
        handlers.logSuccess?.(args, Date.now() - startTime)
      }
      return result
    } catch (rawError) {
      const normalized = normalizeConvexError(rawError)
      const stale = isIdentityChangedError(normalized) || getIdentityGeneration() !== generation

      if (stale) {
        // Retire silently under the new identity: no state commit, no callback,
        // no log, no DevTools event. Surface IDENTITY_CHANGED to the caller.
        throw isIdentityChangedError(normalized)
          ? normalized
          : createIdentityChangedError(devtoolsKind)
      }

      const committed = callState.commitError(requestId, normalized)
      if (committed) {
        if (handlers.onError) runCallback(() => handlers.onError!(normalized, args))
        if (devToolsId) {
          const settledAt = Date.now()
          devtools?.updateMutation(devToolsId, {
            state: 'error',
            error: normalized.message,
            settledAt,
            duration: settledAt - startTime,
          })
        }
        handlers.logError?.(args, Date.now() - startTime, normalized)
      }
      throw normalized
    }
  }

  const safe = async (args: Args): Promise<CallResult<Result>> => {
    try {
      return { ok: true, data: await run(args) }
    } catch (error) {
      // The throwing path already threw a ConvexCallError; re-normalizing passes
      // it through unchanged so both paths yield an equal toJSON().
      return { ok: false, error: normalizeConvexError(error) }
    }
  }

  const onIdentityMaybeChanged = () => {
    const generation = getIdentityGeneration()
    if (generation === lastSeenGeneration) return
    lastSeenGeneration = generation
    callState.mask()
  }

  return {
    run,
    safe,
    data: callState.data,
    status: callState.status,
    pending: callState.pending,
    error: callState.error,
    reset: callState.reset,
    onIdentityMaybeChanged,
  }
}

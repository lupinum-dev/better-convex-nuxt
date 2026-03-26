/**
 * Canonical base interfaces used internally for type-checking composable shapes.
 * Not exported from the module's public API.
 */
import type { ComputedRef, Ref } from 'vue'

import type { ConvexCallStatus } from './types'

/**
 * Returned by query composables (useConvexQuery, useConvexPaginatedQuery).
 */
export interface ConvexQueryBase<DataT> {
  data: Ref<DataT | null>
  error: Ref<Error | null>
  pending: Ref<boolean>
  status: Ref<ConvexCallStatus>
  refresh: () => Promise<void>
  reset: () => void
}

/**
 * Returned by mutation/action composables.
 */
export interface ConvexCallBase<Args, Result> {
  data: Ref<Result | undefined>
  error: Ref<Error | null>
  pending: ComputedRef<boolean>
  status: ComputedRef<ConvexCallStatus>
  execute: (args: Args) => Promise<Result>
  reset: () => void
}

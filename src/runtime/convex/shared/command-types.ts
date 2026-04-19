import type { ComputedRef, Ref } from 'vue'

import type { ValidateOption } from '../../utils/resolve-validator.js'
import type { MutationStatus } from '../../utils/types.js'
import type { OptimisticContext } from '../composables/optimistic-updates.js'

export type UseConvexMutationReturn<Args, Result> = ((args: Args) => Promise<Result>) & {
  data: Ref<Result | undefined>
  status: ComputedRef<MutationStatus>
  pending: ComputedRef<boolean>
  error: Ref<Error | null>
  reset: () => void
}

export interface UseConvexMutationOptions<Args, Result> {
  optimisticUpdate?: (ctx: OptimisticContext, args: Args) => void
  onSuccess?: (result: Result, args: Args) => void
  onError?: (error: Error, args: Args) => void
  validate?: ValidateOption
}

export interface UseConvexActionOptions<Args, Result> {
  validate?: ValidateOption
  onSuccess?: (result: Result, args: Args) => void
  onError?: (error: Error, args: Args) => void
}

export type UseConvexActionReturn<Args, Result> = UseConvexMutationReturn<Args, Result>

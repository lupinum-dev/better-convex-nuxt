import type { FunctionReference } from 'convex/server'
import type { ComputedRef } from 'vue'
import { computed, ref, watch } from 'vue'

import { useConvexAuth } from './useConvexAuth'
import { useConvexMutation, type UseConvexMutationReturn } from './useConvexMutation'

type EmptyArgsMutation = FunctionReference<'mutation'>

export interface UseEnsureConvexUserReturn {
  pending: ComputedRef<boolean>
  error: ComputedRef<Error | null>
  ensured: ComputedRef<boolean>
}

function isHarmlessBootstrapError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /already|duplicate|exists/i.test(message)
}

/**
 * Ensure the app-level Convex user row exists once auth becomes active.
 *
 * The module does not know how your app creates or enriches user rows, so the
 * app still owns the mutation reference. This helper only handles the common
 * timing edge: Better Auth becomes ready before the Convex user row exists.
 */
export function useEnsureConvexUser<TMutation extends EmptyArgsMutation>(
  mutationRef: TMutation,
): UseEnsureConvexUserReturn {
  const { isAuthenticated, user } = useConvexAuth()
  const lastEnsuredUserId = ref<string | null>(null)

  if (import.meta.server) {
    return {
      pending: computed(() => false),
      error: computed(() => null),
      ensured: computed(() => false),
    }
  }

  const ensureUser = useConvexMutation(mutationRef as EmptyArgsMutation) as UseConvexMutationReturn<
    Record<string, never>,
    unknown
  >

  watch(
    [isAuthenticated, user],
    async ([authenticated, currentUser]) => {
      if (!authenticated || !currentUser?.id) {
        lastEnsuredUserId.value = null
        return
      }

      if (lastEnsuredUserId.value === currentUser.id || ensureUser.pending.value) {
        return
      }

      try {
        await ensureUser({})
        lastEnsuredUserId.value = currentUser.id
      }
      catch (error) {
        if (isHarmlessBootstrapError(error)) {
          ensureUser.reset()
          lastEnsuredUserId.value = currentUser.id
          return
        }
      }
    },
    { immediate: true },
  )

  return {
    pending: computed(() => ensureUser.pending.value),
    error: computed(() => ensureUser.error.value),
    ensured: computed(() => {
      return !!user.value?.id && lastEnsuredUserId.value === user.value.id
    }),
  }
}

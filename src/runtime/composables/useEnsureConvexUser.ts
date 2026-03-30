import type { FunctionReference } from 'convex/server'
import { computed, ref, watch } from 'vue'

import { useConvexAuth } from './useConvexAuth'
import { useConvexMutation, type UseConvexMutationReturn } from './useConvexMutation'

type EmptyArgsMutation = FunctionReference<'mutation'>

export interface UseEnsureConvexUserReturn {
  pending: ReturnType<typeof computed<boolean>>
  error: ReturnType<typeof computed<Error | null>>
  ensured: ReturnType<typeof computed<boolean>>
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
  const ensureUser = useConvexMutation(mutationRef as EmptyArgsMutation) as UseConvexMutationReturn<
    Record<string, never>,
    unknown
  >
  const lastEnsuredUserId = ref<string | null>(null)

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
      catch {
        // Example apps intentionally treat duplicate bootstrap attempts as harmless.
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

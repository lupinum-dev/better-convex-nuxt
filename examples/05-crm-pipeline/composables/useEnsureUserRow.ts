import { computed, watch } from 'vue'

import { api } from '~/convex/_generated/api'

export function useEnsureUserRow() {
  const { isAuthenticated } = useConvexAuth()
  const ensureUser = useConvexMutation(api.auth.createUserIfNeeded)

  watch(
    isAuthenticated,
    async (value) => {
      if (!value) return
      try {
        await ensureUser({})
      }
      catch {
        // Duplicate bootstrap calls are fine in example apps.
      }
    },
    { immediate: true },
  )

  return {
    pending: computed(() => ensureUser.pending.value),
    error: computed(() => ensureUser.error.value),
  }
}

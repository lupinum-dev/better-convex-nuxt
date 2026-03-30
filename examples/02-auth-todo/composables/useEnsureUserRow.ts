import { computed, ref, watch } from 'vue'

import { api } from '~/convex/_generated/api'

export function useEnsureUserRow() {
  const { isAuthenticated } = useConvexAuth()
  const ensureUser = useConvexMutation(api.auth.createUserIfNeeded)
  const ready = ref(false)

  watch(
    isAuthenticated,
    async (value) => {
      if (!value) {
        ready.value = false
        return
      }
      try {
        await ensureUser({})
        ready.value = true
      }
      catch {
        ready.value = false
      }
    },
    { immediate: true },
  )

  return {
    ready: computed(() => ready.value),
    pending: computed(() => ensureUser.pending.value),
    error: computed(() => ensureUser.error.value),
  }
}

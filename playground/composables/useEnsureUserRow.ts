import { computed, watchEffect } from 'vue'

import { api } from '~/convex/_generated/api'
import { shouldEnsureUserRow, type EnsureUserDebugContext } from './ensure-user-row-debug'

export function useEnsureUserRow(
  ctx: { value: EnsureUserDebugContext },
  pending: { value: boolean },
) {
  const createUser = useConvexMutation(api.auth.createUserIfNeeded)

  watchEffect(async () => {
    if (pending.value) return
    if (shouldEnsureUserRow(ctx.value)) {
      await createUser({})
    }
  })

  return {
    pending: computed(() => createUser.pending.value),
    error: computed(() => createUser.error.value),
  }
}

import { computed, watchEffect, type ComputedRef } from 'vue'

import { createAuth } from '#imports'
import { api } from '~/convex/_generated/api'

type ResourceWithCan = {
  _can?: Record<string, boolean>
}

const { usePermissions: useBasePermissions, useAuthGuard: useBaseAuthGuard } = createAuth({
  query: api.auth.getPermissionContext,
})

export function usePermissions() {
  const base = useBasePermissions()
  const createUser = useConvexMutation(api.auth.createUserIfNeeded)

  watchEffect(async () => {
    if (base.pending.value) return
    const context = base.ctx.value as {
      _debug?: { hasIdentity?: boolean; hasUser?: boolean; reason?: string }
    } | null
    const debugInfo = context?._debug
    if (
      debugInfo?.hasIdentity &&
      !debugInfo?.hasUser &&
      debugInfo?.reason === 'user not found in DB, needs to be created'
    ) {
      await createUser({})
    }
  })

  function can(permission: string, resource?: ResourceWithCan): ComputedRef<boolean> {
    if (resource) {
      return computed(() => resource._can?.[permission] === true)
    }
    return base.can(permission)
  }

  return {
    ...base,
    user: computed(() => base.ctx.value),
    can,
  }
}

export function useAuthGuard(permission: string, redirectTo = '/') {
  return useBaseAuthGuard({
    can: permission,
    redirectTo,
    loginPath: '/auth/signin',
  })
}

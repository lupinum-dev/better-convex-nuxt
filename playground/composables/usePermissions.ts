import { computed, type ComputedRef } from 'vue'

import { createAuth } from 'better-convex-nuxt/composables'
import { api } from '~/convex/_generated/api'

type ResourceWithCan = {
  _can?: Record<string, boolean>
}

const { usePermissions: useBasePermissions, useAuthGuard: useBaseAuthGuard } = createAuth({
  query: api.auth.getPermissionContext,
})

export function usePermissions() {
  const base = useBasePermissions()
  useEnsureUserRow(base.ctx, base.pending)

  function can(permission: string, resource?: ResourceWithCan): ComputedRef<boolean> {
    if (resource) {
      return computed(() => resource._can?.[permission] === true)
    }
    return base.can(permission)
  }

  return {
    ...base,
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

import { computed, type ComputedRef } from 'vue'

import { api } from '@@/convex/_generated/api'

import { createAuth } from '#imports'

type ResourceWithCan = {
  _can?: Record<string, boolean>
}

const { usePermissions: useBasePermissions, useAuthGuard: useBaseAuthGuard } = createAuth({
  query: api.auth.getPermissionContext,
})

export function useDemoPermissions() {
  const base = useBasePermissions()

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

export function useAuthGuard(permission: string, redirectTo = '/demo') {
  return useBaseAuthGuard({
    can: permission,
    redirectTo,
    loginPath: '/',
  })
}

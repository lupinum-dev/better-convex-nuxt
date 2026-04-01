import { computed, type ComputedRef } from 'vue'
import {
  usePermissions as useBuiltInPermissions,
  useAuthGuard as useBuiltInAuthGuard,
} from '#imports'

type ResourceWithCan = {
  _can?: Record<string, boolean>
}

export function useDemoPermissions() {
  const base = useBuiltInPermissions()

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

export function useAuthGuard(permission: string, redirectTo = '/demo') {
  return useBuiltInAuthGuard({
    can: permission,
    redirectTo,
    loginPath: '/',
  })
}

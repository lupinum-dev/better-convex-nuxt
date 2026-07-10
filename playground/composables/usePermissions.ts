/**
 * Permission Composable (userland pattern, no package permission runtime)
 *
 * This module ships no permissions runtime (vNext §6). This composable is a
 * thin wrapper around a plain `useConvexQuery` call plus the app-owned
 * `checkPermission()` from `convex/permissions.config.ts`. See the
 * "Auth Guards and Permissions" recipe in the docs for the general pattern.
 */

import { api } from '#convex/api'
import {
  checkPermission,
  type Permission,
  type PermissionContext,
  type Resource,
} from '~/convex/permissions.config'

// Re-export types for convenience
export type { Permission, Resource }

// ============================================
// USE PERMISSIONS
// ============================================
//
//   const { can, user, isAuthenticated, pending } = usePermissions()
//   <button v-if="can('post.update', post)">Edit</button>

export function usePermissions() {
  const { data: context, status } = useConvexQuery(api.auth.getPermissionContext, {})

  function can(permission: Permission, resource?: Resource): boolean {
    return checkPermission(
      (context.value ?? null) as PermissionContext | null,
      permission,
      resource,
    )
  }

  return {
    can,
    user: computed(() => context.value ?? null),
    role: computed(() => context.value?.role ?? null),
    isAuthenticated: computed(() => Boolean(context.value)),
    pending: computed(() => status.value === 'pending'),
  }
}

// ============================================
// USE PERMISSION REDIRECT
// ============================================

export function usePermissionRedirect(options: {
  permission: Permission
  redirectTo?: string
  resource?: Resource
  loginPath?: string
}) {
  const { permission, redirectTo = '/', resource, loginPath = '/auth/signin' } = options
  const { can, pending, isAuthenticated } = usePermissions()
  const router = useRouter()

  let pendingRedirect = false

  watchEffect(() => {
    if (pending.value || pendingRedirect) return

    if (!isAuthenticated.value) {
      pendingRedirect = true
      void router.push(loginPath).finally(() => {
        pendingRedirect = false
      })
      return
    }

    if (!can(permission, resource)) {
      pendingRedirect = true
      void router.push(redirectTo).finally(() => {
        pendingRedirect = false
      })
    }
  })
}

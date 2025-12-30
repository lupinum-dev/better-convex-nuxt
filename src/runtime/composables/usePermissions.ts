/**
 * Permission Composables
 *
 * Factory functions for creating role-based access control composables.
 * Users create their own usePermissions composable using createPermissions().
 *
 * @example
 * ```ts
 * // ~/composables/usePermissions.ts
 * import { createPermissions } from '#imports'
 * import { api } from '~/convex/_generated/api'
 * import { checkPermission, type Permission, type Resource } from '~/convex/permissions.config'
 *
 * export const { usePermissions, usePermissionGuard } = createPermissions({
 *   query: api.auth.getPermissionContext,
 *   checkPermission,
 * })
 * ```
 */

import type { FunctionReference } from 'convex/server'

import { useRouter } from '#imports'
import { computed, watchEffect, type ComputedRef } from 'vue'

import { useConvexQuery } from './useConvexQuery'

// ============================================
// TYPES
// ============================================

/**
 * Permission context returned by user's getPermissionContext query.
 * Must include at least role and userId.
 */
export interface PermissionContext {
  role: string
  userId: string
  orgId?: string
  [key: string]: unknown
}

/**
 * Resource with optional ownership information.
 */
export interface Resource {
  ownerId?: string
  [key: string]: unknown
}

/**
 * Check permission function signature.
 * User provides this from their permissions.config.ts
 */
export type CheckPermissionFn<TPermission extends string = string> = (
  ctx: { role: string; userId: string } | null,
  permission: TPermission,
  resource?: Resource,
) => boolean

/**
 * Options for createPermissions factory.
 */
export interface CreatePermissionsOptions<
  TPermission extends string = string,
  TContext extends PermissionContext = PermissionContext,
> {
  /** Convex query that returns permission context (role, userId, orgId, etc.) */
  query: FunctionReference<'query'>
  /** Permission checking function from permissions.config.ts */
  checkPermission: CheckPermissionFn<TPermission>
}

/**
 * Return type of usePermissions composable.
 */
export interface UsePermissionsReturn<
  TPermission extends string = string,
  TContext extends PermissionContext = PermissionContext,
> {
  /** Check if user has a specific permission (reactive) */
  can: (permission: TPermission, resource?: Resource) => ComputedRef<boolean>
  /** Current user's permission context */
  user: ComputedRef<TContext | null>
  /** Current user's role */
  role: ComputedRef<string | null>
  /** Current user's organization ID */
  orgId: ComputedRef<string | null>
  /** Whether user is authenticated with valid permission context */
  isAuthenticated: ComputedRef<boolean>
  /** Whether permission context is still loading */
  isLoading: ComputedRef<boolean>
}

/**
 * Options for usePermissionGuard.
 */
export interface UsePermissionGuardOptions<TPermission extends string = string> {
  /** Permission required to access the page */
  permission: TPermission
  /** Path to redirect if permission denied */
  redirectTo?: string
  /** Resource to check ownership against */
  resource?: Resource
  /** Path to redirect if not authenticated */
  loginPath?: string
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create permission composables configured for your application.
 *
 * @example
 * ```ts
 * // ~/composables/usePermissions.ts
 * import { createPermissions } from '#imports'
 * import { api } from '~/convex/_generated/api'
 * import { checkPermission } from '~/convex/permissions.config'
 *
 * export const { usePermissions, usePermissionGuard } = createPermissions({
 *   query: api.auth.getPermissionContext,
 *   checkPermission,
 * })
 * ```
 */
export function createPermissions<
  TPermission extends string = string,
  TContext extends PermissionContext = PermissionContext,
>(options: CreatePermissionsOptions<TPermission, TContext>) {
  const { query, checkPermission } = options

  /**
   * Access permission state and check permissions in components.
   *
   * @example
   * ```vue
   * <script setup>
   * const { can, role, isAuthenticated } = usePermissions()
   * </script>
   *
   * <template>
   *   <button v-if="can('post.create')">New Post</button>
   *   <button v-if="can('post.update', post)">Edit</button>
   * </template>
   * ```
   */
  function usePermissions(): UsePermissionsReturn<TPermission, TContext> {
    // Fetch permission context from Convex
    const { data: permissionContext, pending: isLoading } = useConvexQuery(query, {})

    // Build context object for checkPermission
    const ctx = computed(() => {
      const context = permissionContext.value as TContext | null
      if (!context?.role) return null
      return {
        role: context.role,
        userId: context.userId,
      }
    })

    // Permission check function (returns reactive ComputedRef)
    function can(permission: TPermission, resource?: Resource): ComputedRef<boolean> {
      return computed(() => checkPermission(ctx.value, permission, resource))
    }

    // Convenience getters
    const isAuthenticated = computed(() => !!ctx.value)
    const user = computed(() => permissionContext.value as TContext | null)
    const role = computed(() => (permissionContext.value as TContext | null)?.role ?? null)
    const orgId = computed(() => (permissionContext.value as TContext | null)?.orgId ?? null)

    return {
      can,
      user,
      role,
      orgId,
      isAuthenticated,
      isLoading,
    }
  }

  /**
   * Protect a page with permission requirements.
   * Redirects if user lacks permission.
   *
   * @example
   * ```vue
   * <script setup>
   * // Redirect to /dashboard if user can't access org settings
   * usePermissionGuard({
   *   permission: 'org.settings',
   *   redirectTo: '/dashboard',
   * })
   * </script>
   * ```
   */
  function usePermissionGuard(guardOptions: UsePermissionGuardOptions<TPermission>) {
    const { permission, redirectTo = '/', resource, loginPath = '/auth/signin' } = guardOptions

    const { can, isLoading, isAuthenticated } = usePermissions()
    const router = useRouter()

    // Create permission ref once at setup time
    const hasPermission = can(permission, resource)

    watchEffect(() => {
      // Wait for permissions to load
      if (isLoading.value) return

      // Redirect to login if not authenticated
      if (!isAuthenticated.value) {
        router.push(loginPath)
        return
      }

      // Redirect if user lacks permission
      if (!hasPermission.value) {
        router.push(redirectTo)
      }
    })
  }

  return {
    usePermissions,
    usePermissionGuard,
  }
}

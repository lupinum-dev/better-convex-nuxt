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
import type { RouteLocationRaw } from 'vue-router'

import { useRouter, useRuntimeConfig } from '#imports'
import { computed, watchEffect, type ComputedRef, type Ref } from 'vue'

import { createConvexQueryState } from './useConvexQuery'

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
  _TContext extends PermissionContext = PermissionContext,
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
  pending: Ref<boolean>
}

/**
 * Options for usePermissionGuard.
 */
export interface UsePermissionGuardOptions<TPermission extends string = string> {
  /** Permission required to access the page */
  permission: TPermission
  /** Path to redirect if permission denied */
  redirectTo?: RouteLocationRaw
  /** Resource to check ownership against */
  resource?: Resource
  /** Path to redirect if not authenticated */
  loginPath?: RouteLocationRaw
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
    const { data: permissionContext, pending, error } = createConvexQueryState(query, {}, undefined, true).resultData
    const runtimeConfig = useRuntimeConfig()

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

    if (import.meta.dev) {
      let warnedPermissionSetupError = false
      watchEffect(() => {
        const publicConvex = runtimeConfig.public.convex as Record<string, unknown> | undefined
        const permissionsEnabled = Boolean(publicConvex?.permissions)
        if (!permissionsEnabled) return
        if (!error.value) return
        if (warnedPermissionSetupError) return

        warnedPermissionSetupError = true
        console.warn(
          '[better-convex-nuxt] Permissions enabled but permission context query failed. ' +
            'Check `api.auth.getPermissionContext`, confirm your schema/query is synced, and run `npx convex dev` if needed.',
          error.value,
        )
      })
    }

    return {
      can,
      user,
      role,
      orgId,
      isAuthenticated,
      pending,
    }
  }

  /**
   * Protect a page with permission requirements.
   * Redirects if user lacks permission.
   *
   * Includes protection against rapid redirect loops by tracking
   * pending navigation state.
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

    const { can, pending, isAuthenticated } = usePermissions()
    const router = useRouter()

    // Create permission ref once at setup time
    const hasPermission = can(permission, resource)

    // Track pending redirect to prevent double navigation
    let pendingRedirect = false

    watchEffect(() => {
      // Wait for permissions to load
      if (pending.value) return

      // Prevent multiple rapid redirects
      if (pendingRedirect) return

      // Redirect to login if not authenticated
      if (!isAuthenticated.value) {
        pendingRedirect = true
        void router.push(loginPath).finally(() => {
          pendingRedirect = false
        })
        return
      }

      // Redirect if user lacks permission
      if (!hasPermission.value) {
        pendingRedirect = true
        void router.push(redirectTo).finally(() => {
          pendingRedirect = false
        })
      }
    })
  }

  return {
    usePermissions,
    usePermissionGuard,
  }
}

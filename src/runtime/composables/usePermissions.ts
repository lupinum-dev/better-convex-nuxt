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
 * import { api } from '#convex/api'
 * import { checkPermission, type Permission, type Resource } from '~/convex/permissions.config'
 *
 * export const { usePermissions, usePermissionRedirect } = createPermissions({
 *   query: api.auth.getPermissionContext,
 *   checkPermission,
 * })
 * ```
 */

import type { FunctionReference } from 'convex/server'
import { computed, watchEffect, type ComputedRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

import { useRouter, useRuntimeConfig } from '#imports'

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
}

/**
 * Resource with optional ownership information.
 */
export interface Resource {
  ownerId?: string
}

/**
 * Check permission function signature.
 * User provides this from their permissions.config.ts
 */
export type CheckPermissionFn<
  TPermission extends string = string,
  TContext extends PermissionContext = PermissionContext,
  TResource extends Resource = Resource,
> = (ctx: TContext | null, permission: TPermission, resource?: TResource) => boolean

/**
 * Options for createPermissions factory.
 */
export interface CreatePermissionsOptions<
  TPermission extends string = string,
  TContext extends PermissionContext = PermissionContext,
  TResource extends Resource = Resource,
> {
  /** Convex query that returns permission context (role, userId, orgId, etc.) */
  query: FunctionReference<'query', 'public', Record<string, never>, TContext | null>
  /** Permission checking function from permissions.config.ts */
  checkPermission: CheckPermissionFn<TPermission, TContext, TResource>
}

/**
 * Return type of usePermissions composable.
 */
export interface UsePermissionsReturn<
  TPermission extends string = string,
  TContext extends PermissionContext = PermissionContext,
  TResource extends Resource = Resource,
> {
  /** Check if user has a specific permission (reactive) */
  can: (permission: TPermission, resource?: TResource) => ComputedRef<boolean>
  /** Current user's permission context */
  user: ComputedRef<TContext | null>
  /** Current user's role */
  role: ComputedRef<string | null>
  /** Current user's organization ID */
  orgId: ComputedRef<string | null>
  /** Whether user is authenticated with valid permission context */
  isAuthenticated: ComputedRef<boolean>
  /** Whether permission context is still loading */
  pending: ComputedRef<boolean>
}

/**
 * Options for usePermissionRedirect.
 */
export interface UsePermissionRedirectOptions<
  TPermission extends string = string,
  TResource extends Resource = Resource,
> {
  /** Permission required before staying on the current view */
  permission: TPermission
  /** Path to redirect if permission denied */
  redirectTo?: RouteLocationRaw
  /** Resource to check ownership against */
  resource?: TResource
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
 * import { api } from '#convex/api'
 * import { checkPermission } from '~/convex/permissions.config'
 *
 * export const { usePermissions, usePermissionRedirect } = createPermissions({
 *   query: api.auth.getPermissionContext,
 *   checkPermission,
 * })
 * ```
 */
export function createPermissions<
  TPermission extends string = string,
  TContext extends PermissionContext = PermissionContext,
  TResource extends Resource = Resource,
>(options: CreatePermissionsOptions<TPermission, TContext, TResource>) {
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
  function usePermissions(): UsePermissionsReturn<TPermission, TContext, TResource> {
    // Fetch permission context from Convex
    const {
      data: permissionContext,
      pending,
      error,
    } = createConvexQueryState(query, {}, undefined, true).resultData
    const runtimeConfig = useRuntimeConfig()

    // Build context object for checkPermission
    const ctx = computed<TContext | null>(() => {
      const context = permissionContext.value
      if (!context?.role) return null
      return context
    })

    // Permission check function (returns reactive ComputedRef)
    function can(permission: TPermission, resource?: TResource): ComputedRef<boolean> {
      return computed(() => checkPermission(ctx.value, permission, resource))
    }

    // Convenience getters
    const isAuthenticated = computed(() => !!ctx.value)
    const user = computed(() => permissionContext.value)
    const role = computed(() => permissionContext.value?.role ?? null)
    const orgId = computed(() => permissionContext.value?.orgId ?? null)

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
   * Redirect after render when the current user lacks a permission.
   * Enforce real access control in Convex functions; this is only a UX helper.
   *
   * Suppresses rapid redirect loops by tracking pending navigation state.
   *
   * @example
   * ```vue
   * <script setup>
   * // Redirect to /dashboard if user can't access org settings
   * usePermissionRedirect({
   *   permission: 'org.settings',
   *   redirectTo: '/dashboard',
   * })
   * </script>
   * ```
   */
  function usePermissionRedirect(
    guardOptions: UsePermissionRedirectOptions<TPermission, TResource>,
  ) {
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
    usePermissionRedirect,
  }
}

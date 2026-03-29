/**
 * Tenant Composables
 *
 * Factory function for creating org-scoped query/mutation composables.
 * Wraps useConvexQuery and useConvexMutation with automatic org-scoping.
 *
 * @example
 * ```ts
 * // ~/composables/useTenant.ts
 * import { createTenantComposables } from 'better-convex-nuxt/composables'
 * import { api } from '~/convex/_generated/api'
 * import { checkPermission } from '~/convex/permissions.config'
 *
 * export const {
 *   useScopedQuery,
 *   useScopedMutation,
 *   useTenantContext,
 * } = createTenantComposables({
 *   permissionQuery: api.auth.getPermissionContext,
 *   checkPermission,
 * })
 * ```
 */

import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, type Ref, toValue } from 'vue'

import type { CheckPermissionFn, Resource } from './usePermissions'
import { createPermissions } from './usePermissions'
import { useConvexMutation, type UseConvexMutationOptions, type UseConvexMutationReturn } from './useConvexMutation'
import { useConvexQuery, type UseConvexQueryOptions, type UseConvexQueryReturn } from './useConvexQuery'

// ============================================================================
// Types
// ============================================================================

export interface CreateTenantComposablesOptions<TPermission extends string = string> {
  /** Convex query that returns permission context (must include orgId) */
  permissionQuery: FunctionReference<'query'>
  /** Permission checking function from permissions.config.ts */
  checkPermission: CheckPermissionFn<TPermission>
}

export interface UseTenantContextReturn<TPermission extends string = string> {
  /** Current organization ID (null when not in an org) */
  orgId: ComputedRef<string | null>
  /** Current user context */
  user: ComputedRef<{ role: string; userId: string } | null>
  /** Whether auth + permissions are loaded and orgId is present */
  isReady: ComputedRef<boolean>
  /** Whether permission context is still loading */
  pending: Ref<boolean>
  /** Check if user has a specific permission (reactive) */
  can: (permission: TPermission, resource?: Resource) => ComputedRef<boolean>
}

// ============================================================================
// Factory
// ============================================================================

export function createTenantComposables<TPermission extends string = string>(
  options: CreateTenantComposablesOptions<TPermission>,
) {
  const { usePermissions } = createPermissions({
    query: options.permissionQuery,
    checkPermission: options.checkPermission,
  })

  // ──────────────────────────────────────────────────────────
  // useTenantContext
  // ──────────────────────────────────────────────────────────

  function useTenantContext(): UseTenantContextReturn<TPermission> {
    const permissions = usePermissions()

    const isReady = computed(() => {
      return permissions.isAuthenticated.value && permissions.orgId.value !== null
    })

    return {
      orgId: permissions.orgId,
      user: computed(() => {
        const u = permissions.user.value
        if (!u) return null
        return { role: u.role, userId: u.userId }
      }),
      isReady,
      pending: permissions.pending,
      can: permissions.can,
    }
  }

  // ──────────────────────────────────────────────────────────
  // useScopedQuery
  // ──────────────────────────────────────────────────────────

  function useScopedQuery<
    Query extends FunctionReference<'query'>,
    DataT = FunctionReturnType<Query>,
  >(
    query: Query,
    args?: MaybeRefOrGetter<FunctionArgs<Query> | null | undefined>,
    queryOptions?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
  ): UseConvexQueryReturn<DataT> {
    const { orgId } = useTenantContext()

    // Merge the org readiness check with user-provided args.
    // When orgId is null, we pass undefined to skip the query.
    const scopedArgs = computed(() => {
      if (!orgId.value) return undefined
      const raw = args ? toValue(args) : {}
      // If user explicitly passed null/undefined to skip, respect that
      if (raw == null) return undefined
      return raw
    })

    return useConvexQuery<Query, FunctionArgs<Query> | null | undefined, DataT>(
      query,
      scopedArgs as any,
      queryOptions,
    )
  }

  // ──────────────────────────────────────────────────────────
  // useScopedMutation
  // ──────────────────────────────────────────────────────────

  function useScopedMutation<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    mutationOptions?: UseConvexMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
  ): UseConvexMutationReturn<FunctionArgs<Mutation>, FunctionReturnType<Mutation>> {
    const { orgId } = useTenantContext()
    const inner = useConvexMutation(mutation, mutationOptions)

    // Wrap the callable to guard against no-org calls
    const guarded = (async (args: FunctionArgs<Mutation>) => {
      if (!orgId.value) {
        throw new Error(
          'Cannot execute mutation: no organization context. ' +
          'The user must be a member of an organization before calling scoped mutations.',
        )
      }
      return await (inner as any)(args)
    }) as UseConvexMutationReturn<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>

    // Copy state properties from inner mutation
    Object.defineProperties(guarded, {
      data: { get: () => inner.data, enumerable: true },
      error: { get: () => inner.error, enumerable: true },
      pending: { get: () => inner.pending, enumerable: true },
      status: { get: () => inner.status, enumerable: true },
      reset: { value: inner.reset, enumerable: true },
    })

    return guarded
  }

  return {
    useTenantContext,
    useScopedQuery,
    useScopedMutation,
  }
}

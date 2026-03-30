import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, watchEffect, type ComputedRef, type Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

import { useRouter } from '#imports'

import { createConvexQueryState } from './useConvexQuery'

export type AuthContext = {
  role?: string | null
  plan?: string | null
  userId?: string | null
  tenantId?: string | null
  can?: Record<string, boolean> | null
  [key: string]: unknown
}

export type InferredAuthContext<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
> =
  FunctionReturnType<Query> extends AuthContext | null
    ? NonNullable<FunctionReturnType<Query>>
    : AuthContext

type PermissionRecord<TContext extends AuthContext> =
  NonNullable<TContext['can']> extends Record<string, boolean>
    ? NonNullable<TContext['can']>
    : Record<string, boolean>

export type PermissionKey<TContext extends AuthContext = AuthContext> =
  string extends keyof PermissionRecord<TContext>
    ? string
    : Extract<keyof PermissionRecord<TContext>, string>

export interface CreateAuthOptions<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
  TPermissions extends string = PermissionKey<InferredAuthContext<Query>>,
> {
  query: Query
  /** Explicit permission keys for type-safe `can()` calls. Use when Convex return types don't preserve literal keys. */
  permissions?: readonly TPermissions[]
}

export interface UsePermissionsReturn<TContext extends AuthContext = AuthContext, TPermissions extends string = PermissionKey<TContext>> {
  ctx: ComputedRef<TContext | null>
  role: ComputedRef<TContext['role'] | null>
  plan: ComputedRef<TContext['plan'] | null>
  userId: ComputedRef<TContext['userId'] | null>
  tenantId: ComputedRef<TContext['tenantId'] | null>
  ready: ComputedRef<boolean>
  pending: Ref<boolean>
  can: (key: TPermissions) => ComputedRef<boolean>
}

export interface UseAuthGuardOptions<TContext extends AuthContext = AuthContext, TPermissions extends string = PermissionKey<TContext>> {
  can?: TPermissions
  check?: (ctx: TContext) => boolean
  redirectTo?: RouteLocationRaw
  loginPath?: RouteLocationRaw
  message?: string
}

export function createAuth<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
  TContext extends AuthContext = InferredAuthContext<Query>,
  TPermissions extends string = PermissionKey<TContext>,
>(options: CreateAuthOptions<Query, TPermissions>) {
  const { query } = options

  function usePermissions(): UsePermissionsReturn<TContext, TPermissions> {
    const {
      data,
      pending,
    } = createConvexQueryState(query, {}, undefined, true).resultData

    const ctx = computed<TContext | null>(() => data.value as TContext | null)

    function can(key: TPermissions): ComputedRef<boolean> {
      return computed<boolean>(() => ctx.value?.can?.[key as string] === true)
    }

    return {
      ctx,
      role: computed<TContext['role'] | null>(() => ctx.value?.role ?? null),
      plan: computed<TContext['plan'] | null>(() => ctx.value?.plan ?? null),
      userId: computed<TContext['userId'] | null>(() => ctx.value?.userId ?? null),
      tenantId: computed<TContext['tenantId'] | null>(() => ctx.value?.tenantId ?? null),
      ready: computed<boolean>(() => !!ctx.value),
      pending,
      can,
    }
  }

  function useAuthGuard(options: UseAuthGuardOptions<TContext, TPermissions>): void {
    const {
      can: requiredKey,
      check,
      redirectTo = '/',
      loginPath = '/auth/signin',
    } = options
    const router = useRouter()
    const {
      data,
      pending,
    } = createConvexQueryState(query, {}, undefined, true).resultData
    const ctx = computed<TContext | null>(() => data.value as TContext | null)
    const ready = computed<boolean>(() => !!ctx.value)
    const passesGuard = computed<boolean>(() => {
      if (!ctx.value) return false
      if (typeof check === 'function') return check(ctx.value)
      if (typeof requiredKey === 'string') return ctx.value.can?.[requiredKey as string] === true
      return false
    })
    let redirectPending = false

    watchEffect(() => {
      if (pending.value || data.value === undefined || redirectPending) return

      if (!ready.value) {
        redirectPending = true
        void router.push(loginPath).finally(() => {
          redirectPending = false
        })
        return
      }

      if (!passesGuard.value) {
        redirectPending = true
        void router.push(redirectTo).finally(() => {
          redirectPending = false
        })
      }
    })
  }

  return {
    usePermissions,
    useAuthGuard,
  }
}

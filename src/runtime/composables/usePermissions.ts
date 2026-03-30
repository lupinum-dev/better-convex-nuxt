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

export interface CreateAuthOptions<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
  TContext extends AuthContext =
    FunctionReturnType<Query> extends AuthContext | null
      ? NonNullable<FunctionReturnType<Query>>
      : AuthContext,
> {
  query: Query
}

export interface UsePermissionsReturn<TContext extends AuthContext = AuthContext> {
  ctx: ComputedRef<TContext | null>
  role: ComputedRef<TContext['role'] | null>
  plan: ComputedRef<TContext['plan'] | null>
  userId: ComputedRef<TContext['userId'] | null>
  tenantId: ComputedRef<TContext['tenantId'] | null>
  isAuthenticated: ComputedRef<boolean>
  pending: Ref<boolean>
  can: (key: string) => ComputedRef<boolean>
}

export interface UseAuthGuardOptions {
  can?: string
  check?: (ctx: AuthContext) => boolean
  redirectTo?: RouteLocationRaw
  loginPath?: RouteLocationRaw
  message?: string
}

export function createAuth<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
  TContext extends AuthContext =
    FunctionReturnType<Query> extends AuthContext | null
      ? NonNullable<FunctionReturnType<Query>>
      : AuthContext,
>(options: CreateAuthOptions<Query, TContext>) {
  const { query } = options

  function usePermissions(): UsePermissionsReturn<TContext> {
    const {
      data,
      pending,
    } = createConvexQueryState(query, {}, undefined, true).resultData

    const ctx = computed(() => data.value as TContext | null)

    function can(key: string): ComputedRef<boolean> {
      return computed(() => ctx.value?.can?.[key] === true)
    }

    return {
      ctx,
      role: computed(() => ctx.value?.role ?? null),
      plan: computed(() => ctx.value?.plan ?? null),
      userId: computed(() => ctx.value?.userId ?? null),
      tenantId: computed(() => ctx.value?.tenantId ?? null),
      isAuthenticated: computed(() => !!ctx.value),
      pending,
      can,
    }
  }

  function useAuthGuard(options: UseAuthGuardOptions): void {
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
    const ctx = computed(() => data.value as TContext | null)
    const isAuthenticated = computed(() => !!ctx.value)
    const passesGuard = computed(() => {
      if (!ctx.value) return false
      if (typeof check === 'function') return check(ctx.value)
      if (typeof requiredKey === 'string') return ctx.value.can?.[requiredKey] === true
      return false
    })
    let redirectPending = false

    watchEffect(() => {
      if (pending.value || data.value === undefined || redirectPending) return

      if (!isAuthenticated.value) {
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

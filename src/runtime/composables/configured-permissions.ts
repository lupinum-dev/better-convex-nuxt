import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, watchEffect, type ComputedRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

import { useNuxtApp, useRouter } from '#imports'

import { useConvexAuth } from '../auth/composables/useConvexAuth.js'
import type { PermissionContextBase } from '../auth/define-permission-context.js'
import type {
  PermissionHandle,
  RegisteredProjectedPermissionKey,
} from '../auth/define-permission.js'
import { resolvePermissionKey } from '../auth/define-permission.js'
import { hasConvexAuthRuntime } from '../auth/internal/auth-runtime.js'
import { createConvexQueryState } from '../convex/query/query-runtime.js'
import { useAuthBootstrapDevtoolsState, usePermissionDevtoolsState } from '../devtools/state.js'
import type { NoInfer } from '../types/type-utils.js'

export type AuthContext = PermissionContextBase<Record<string, boolean>> & {
  plan?: string | null
  [key: string]: unknown
}

export type InferredAuthContext<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
> =
  FunctionReturnType<Query> extends AuthContext | null
    ? NonNullable<FunctionReturnType<Query>>
    : AuthContext

export type InferPermissionContext<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
> = InferredAuthContext<Query>

type PermissionRecord<TContext extends AuthContext> =
  NonNullable<TContext['can']> extends Record<string, boolean>
    ? NonNullable<TContext['can']>
    : Record<string, boolean>

export type PermissionKey<TContext extends AuthContext = AuthContext> =
  string extends keyof PermissionRecord<TContext>
    ? string
    : Extract<keyof PermissionRecord<TContext>, string>

export type ValidatePermissionKey<
  TContext extends AuthContext = AuthContext,
  TKey extends string = string,
> = TKey extends NoInfer<PermissionKey<TContext>> ? TKey : never

type ConfiguredPermissionKey<TContext extends AuthContext> =
  string extends PermissionKey<TContext>
    ? [RegisteredProjectedPermissionKey] extends [never]
      ? string
      : RegisteredProjectedPermissionKey
    : PermissionKey<TContext>

export interface UsePermissionsReturn<
  TContext extends AuthContext = AuthContext,
  TPermissions extends string = ConfiguredPermissionKey<TContext>,
> {
  ctx: ComputedRef<TContext | null>
  role: ComputedRef<TContext['role'] | null>
  plan: ComputedRef<TContext['plan'] | null>
  userId: ComputedRef<TContext['userId'] | null>
  tenantId: ComputedRef<TContext['tenantId'] | null>
  ready: ComputedRef<boolean>
  pending: ComputedRef<boolean>
  allows: (permission: PermissionHandle<TPermissions>) => ComputedRef<boolean>
}

export interface UseAuthGuardOptions<
  TContext extends AuthContext = AuthContext,
  TPermissions extends string = ConfiguredPermissionKey<TContext>,
> {
  permission?: PermissionHandle<TPermissions>
  check?: (ctx: TContext) => boolean
  redirectTo?: RouteLocationRaw
  loginPath?: RouteLocationRaw
}

function shouldEmitDevWarning(): boolean {
  return import.meta.dev || process.env.NODE_ENV !== 'production'
}

function usePermissionContextState<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
  TContext extends AuthContext = InferredAuthContext<Query>,
>(query: Query, configuredQueryName: string) {
  const nuxtApp = useNuxtApp()
  const authState = hasConvexAuthRuntime(nuxtApp) ? useConvexAuth() : null
  const authBootstrapState = useAuthBootstrapDevtoolsState()

  const shouldWaitForBootstrap = computed<boolean>(() => {
    if (!authState?.isAuthenticated.value) return false
    if (!authBootstrapState.value.mutationName) return false
    if (authBootstrapState.value.ensured) return false
    if (authBootstrapState.value.error) return false
    return true
  })
  const queryArgs = computed<Record<string, never> | undefined>(() =>
    shouldWaitForBootstrap.value ? undefined : {},
  )
  const queryState = createConvexQueryState(query, queryArgs, undefined, true).resultData
  const { data, error } = queryState
  const pending = computed<boolean>(() => queryState.pending.value || shouldWaitForBootstrap.value)
  const rawCtx = computed<TContext | null>(() => data.value as TContext | null)
  const ctx = computed<TContext | null>(() => {
    const value = rawCtx.value
    if (!authState) {
      return value
    }

    if (authState.isPending.value || !authState.isAuthenticated.value) {
      return null
    }

    const authUserId = authState.user.value?.id
    const contextUserId = value?.userId
    if (
      typeof authUserId === 'string' &&
      typeof contextUserId === 'string' &&
      contextUserId !== authUserId
    ) {
      return null
    }

    return value
  })
  const devtoolsState = usePermissionDevtoolsState()
  let delayedNullWarningTimer: ReturnType<typeof setTimeout> | null = null
  let warnedAboutNullCtx = false

  if (import.meta.client || import.meta.dev) {
    watchEffect(() => {
      devtoolsState.value = {
        queryName: configuredQueryName,
        pending: pending.value,
        ready: !!ctx.value,
        ctx: ctx.value,
        inventory: Object.keys(ctx.value?.can ?? {}),
        error: error.value?.message ?? null,
      }
    })
  }

  if (import.meta.client && shouldEmitDevWarning()) {
    watchEffect((onCleanup) => {
      if (delayedNullWarningTimer) {
        clearTimeout(delayedNullWarningTimer)
        delayedNullWarningTimer = null
      }

      if (
        !authState?.isAuthenticated.value ||
        authState.isPending.value ||
        shouldWaitForBootstrap.value ||
        ctx.value ||
        warnedAboutNullCtx
      ) {
        return
      }

      delayedNullWarningTimer = setTimeout(() => {
        if (
          !authState?.isAuthenticated.value ||
          authState.isPending.value ||
          shouldWaitForBootstrap.value ||
          ctx.value ||
          warnedAboutNullCtx
        ) {
          return
        }
        warnedAboutNullCtx = true
        console.warn(
          `[trellis] usePermissions("${configuredQueryName}") stayed null for more than 2 seconds after auth became ready. Check \`trellis.permissions.query\` and actor bootstrap flow.`,
        )
      }, 2000)

      onCleanup(() => {
        if (delayedNullWarningTimer) {
          clearTimeout(delayedNullWarningTimer)
          delayedNullWarningTimer = null
        }
      })
    })
  }

  return {
    data,
    ctx,
    pending,
  }
}

export function createConfiguredPermissionsComposables<
  Query extends FunctionReference<'query'> = FunctionReference<'query'>,
  TContext extends AuthContext = InferredAuthContext<Query>,
  TPermissions extends string = ConfiguredPermissionKey<TContext>,
>(query: Query, configuredQueryName: string) {
  function usePermissions(): UsePermissionsReturn<TContext, TPermissions> {
    const { ctx, pending } = usePermissionContextState<Query, TContext>(query, configuredQueryName)

    function allows(permission: PermissionHandle<TPermissions>): ComputedRef<boolean> {
      const key = resolvePermissionKey(permission)
      return computed<boolean>(() => ctx.value?.can?.[key] === true)
    }

    return {
      ctx,
      role: computed<TContext['role'] | null>(() => ctx.value?.role ?? null),
      plan: computed<TContext['plan'] | null>(() => ctx.value?.plan ?? null),
      userId: computed<TContext['userId'] | null>(() => ctx.value?.userId ?? null),
      tenantId: computed<TContext['tenantId'] | null>(() => ctx.value?.tenantId ?? null),
      ready: computed<boolean>(() => !!ctx.value),
      pending,
      allows,
    }
  }

  function useAuthGuard(options: UseAuthGuardOptions<TContext, TPermissions>): void {
    const { permission, check, redirectTo = '/', loginPath = '/auth/signin' } = options
    const router = useRouter()
    const { data, ctx, pending } = usePermissionContextState<Query, TContext>(
      query,
      configuredQueryName,
    )
    const ready = computed<boolean>(() => !!ctx.value)
    const passesGuard = computed<boolean>(() => {
      if (!ctx.value) return false
      if (typeof check === 'function') return check(ctx.value)
      if (permission) return ctx.value.can?.[resolvePermissionKey(permission)] === true
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

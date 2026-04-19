/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from 'convex/values'

import { open, runCheck, type AnyCheck } from './define-guard.js'

export type PermissionContextBase<TCan extends Record<string, boolean>> = {
  userId: string | null
  tenantId: string | null
  role: string | null
  can: TCan
}

type PermissionContextReservedKey = keyof PermissionContextBase<Record<string, boolean>>
type PermissionContextExtensionShape = Record<string, unknown> & {
  userId?: never
  tenantId?: never
  role?: never
  can?: never
}

type PermissionFlags<TGuards extends Record<string, AnyCheck<any>>> = {
  [K in keyof TGuards]: boolean
}

type ResolveFn = (ctx: any) => Promise<unknown | null>
type ActorForResolve<TResolve extends ResolveFn> = Awaited<ReturnType<TResolve>>

type PermissionContextHandlerResult<
  TGuards extends Record<string, AnyCheck<any>>,
  TContext extends Record<string, unknown>,
> = PermissionContextBase<PermissionFlags<TGuards>> & TContext

type PermissionContextOptions<
  TResolve extends ResolveFn,
  TGuards extends Record<string, AnyCheck<any>>,
> = {
  resolve: TResolve
  guards: TGuards
  extend?: (
    ctx: any,
    actor: NonNullable<ActorForResolve<TResolve>>,
  ) => Promise<PermissionContextExtensionShape> | PermissionContextExtensionShape
}

type PermissionContextExtension<TOptions> = TOptions extends {
  extend: (...args: any[]) => infer TResult
}
  ? Awaited<TResult> extends PermissionContextExtensionShape
    ? Awaited<TResult>
    : Record<string, never>
  : Record<string, never>

type PermissionContextDefinition<
  TResolve extends ResolveFn,
  TGuards extends Record<string, AnyCheck<any>>,
  TContext extends Record<string, unknown>,
> = {
  args: {}
  guard: typeof open
  handler: (
    ctx: any,
  ) => Promise<PermissionContextHandlerResult<TGuards, TContext> | null>
}

export function definePermissionContext<
  TResolve extends ResolveFn,
  TGuards extends Record<string, AnyCheck<any>>,
  TExtra extends {
    extend?: (...args: any[]) => Promise<PermissionContextExtensionShape> | PermissionContextExtensionShape
  } = {},
>(
  options: PermissionContextOptions<TResolve, TGuards> & TExtra,
): PermissionContextDefinition<TResolve, TGuards, PermissionContextExtension<TExtra>> {
  function evaluatePermission(
    actor: NonNullable<ActorForResolve<TResolve>>,
    check: AnyCheck<any>,
  ): boolean {
    try {
      return !!runCheck(actor, check)
    } catch (error) {
      if (error instanceof ConvexError) return false
      throw error
    }
  }

  return {
    args: {},
    guard: open,
    handler: async (ctx: any) => {
      const actor = await options.resolve(ctx)
      if (!actor) return null
      const resolvedActor = actor as NonNullable<ActorForResolve<TResolve>>

      const permissions = Object.fromEntries(
        Object.entries(options.guards).map(([key, check]) => [
          key,
          evaluatePermission(resolvedActor, check),
        ]),
      ) as { [K in keyof TGuards]: boolean }

      const actorObj = resolvedActor as Record<string, unknown>
      const base: PermissionContextBase<PermissionFlags<TGuards>> = {
        userId: typeof actorObj.userId === 'string' ? actorObj.userId : null,
        tenantId: typeof actorObj.tenantId === 'string' ? actorObj.tenantId : null,
        role: typeof actorObj.role === 'string' ? actorObj.role : null,
        can: permissions,
      }

      if (!options.extend) {
        return base as PermissionContextHandlerResult<TGuards, PermissionContextExtension<TExtra>>
      }

      const extra = await options.extend(ctx, resolvedActor)
      assertNoReservedExtensionKeys(extra)

      return {
        ...base,
        ...extra,
      } as PermissionContextHandlerResult<TGuards, PermissionContextExtension<TExtra>>
    },
  }
}

function assertNoReservedExtensionKeys(extra: PermissionContextExtensionShape) {
  const reservedKeys: PermissionContextReservedKey[] = ['userId', 'tenantId', 'role', 'can']

  for (const key of reservedKeys) {
    if (key in extra) {
      throw new Error(
        `definePermissionContext.extend() cannot return reserved key "${key}". ` +
          'Use guards for permissions and extend only for additional context.',
      )
    }
  }
}

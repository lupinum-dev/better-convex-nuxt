/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from 'convex/values'

import { open, runCheck, type AnyCheck } from './define-guard.js'
import type { PermissionDefinition } from './define-permission.js'

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

type ResolveFn = (ctx: any) => Promise<unknown | null>
type ActorForResolve<TResolve extends ResolveFn> = Awaited<ReturnType<TResolve>>
type PermissionTuple = readonly PermissionDefinition<string, any>[]

type ProjectedPermissionDefinitions<TPermissions extends PermissionTuple> = Exclude<
  TPermissions[number],
  { project: false }
>

type PermissionFlags<TPermissions extends PermissionTuple> = {
  [P in ProjectedPermissionDefinitions<TPermissions> as P['key']]: boolean
}

type PermissionContextHandlerResult<
  TPermissions extends PermissionTuple,
  TContext extends Record<string, unknown>,
> = PermissionContextBase<PermissionFlags<TPermissions>> & TContext

type PermissionContextOptions<TResolve extends ResolveFn, TPermissions extends PermissionTuple> = {
  resolve: TResolve
  permissions: TPermissions
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
  TPermissions extends PermissionTuple,
  TContext extends Record<string, unknown>,
> = {
  args: {}
  guard: typeof open
  permissions: TPermissions
  handler: (
    ctx: any,
  ) => Promise<PermissionContextHandlerResult<TPermissions, TContext> | null>
}

export function definePermissionContext<
  TResolve extends ResolveFn,
  TPermissions extends PermissionTuple,
  TExtra extends {
    extend?: (...args: any[]) => Promise<PermissionContextExtensionShape> | PermissionContextExtensionShape
  } = {},
>(
  options: PermissionContextOptions<TResolve, TPermissions> & TExtra,
): PermissionContextDefinition<TResolve, TPermissions, PermissionContextExtension<TExtra>> {
  async function evaluatePermission(
    actor: NonNullable<ActorForResolve<TResolve>>,
    check: AnyCheck<any>,
  ): Promise<boolean> {
    try {
      return !!runCheck(actor, check as AnyCheck<NonNullable<ActorForResolve<TResolve>>>)
    } catch (error) {
      if (error instanceof ConvexError) return false
      throw error
    }
  }

  const projectedPermissions = options.permissions.filter(
    (permission) => permission.project !== false,
  ) as ProjectedPermissionDefinitions<TPermissions>[]

  return {
    args: {},
    guard: open,
    permissions: options.permissions,
    handler: async (ctx: any) => {
      const actor = await options.resolve(ctx)
      if (!actor) return null
      const resolvedActor = actor as NonNullable<ActorForResolve<TResolve>>

      const permissions = Object.fromEntries(
        await Promise.all(
          projectedPermissions.map(async (permission) => [
            permission.key,
            await evaluatePermission(resolvedActor, permission.check),
          ]),
        ),
      ) as PermissionFlags<TPermissions>

      const actorObj = resolvedActor as Record<string, unknown>
      const base: PermissionContextBase<PermissionFlags<TPermissions>> = {
        userId: typeof actorObj.userId === 'string' ? actorObj.userId : null,
        tenantId: typeof actorObj.tenantId === 'string' ? actorObj.tenantId : null,
        role: typeof actorObj.role === 'string' ? actorObj.role : null,
        can: permissions,
      }

      if (!options.extend) {
        return base as PermissionContextHandlerResult<TPermissions, PermissionContextExtension<TExtra>>
      }

      const extra = await options.extend(ctx, resolvedActor)
      assertNoReservedExtensionKeys(extra)

      return {
        ...base,
        ...extra,
      } as PermissionContextHandlerResult<TPermissions, PermissionContextExtension<TExtra>>
    },
  }
}

function assertNoReservedExtensionKeys(extra: PermissionContextExtensionShape) {
  const reservedKeys: PermissionContextReservedKey[] = ['userId', 'tenantId', 'role', 'can']

  for (const key of reservedKeys) {
    if (key in extra) {
      throw new Error(
        `definePermissionContext.extend() cannot return reserved key "${key}". ` +
          'Use permissions for capability projection and extend only for additional context.',
      )
    }
  }
}

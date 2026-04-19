/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from 'convex/values'

import { open, runCheck, type AnyCheck } from './define-guard.js'
import type { ErasedPermissionDefinition } from './define-permission.js'

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

type PermissionTuple = readonly ErasedPermissionDefinition<string>[]

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

type PermissionContextOptions = {
  resolve: (ctx: any) => Promise<unknown | null>
  permissions: PermissionTuple
  extend?: (
    ctx: any,
    actor: any,
  ) => Promise<PermissionContextExtensionShape> | PermissionContextExtensionShape
}

type ResolveCtx<TOptions extends PermissionContextOptions> = Parameters<TOptions['resolve']>[0]
type ActorForResolve<TOptions extends PermissionContextOptions> = Awaited<
  ReturnType<TOptions['resolve']>
>
type ExtendCtx<TOptions extends PermissionContextOptions> = TOptions extends {
  extend: (ctx: infer TCtx, actor: any) => any
}
  ? TCtx
  : unknown
type MergedCtx<TOptions extends PermissionContextOptions> = ResolveCtx<TOptions> &
  ExtendCtx<TOptions>

type PermissionContextExtension<TOptions extends PermissionContextOptions> = TOptions extends {
  extend: (...args: any[]) => infer TResult
}
  ? Awaited<TResult> extends PermissionContextExtensionShape
    ? Awaited<TResult>
    : Record<string, never>
  : Record<string, never>

type PermissionContextDefinition<
  TCtx,
  TPermissions extends PermissionTuple,
  TContext extends Record<string, unknown>,
> = {
  args: Record<string, never>
  guard: typeof open
  permissions: TPermissions
  handler: (ctx: TCtx) => Promise<PermissionContextHandlerResult<TPermissions, TContext> | null>
}

export function definePermissionContext<TOptions extends PermissionContextOptions>(
  options: TOptions,
): PermissionContextDefinition<
  MergedCtx<TOptions>,
  TOptions['permissions'],
  PermissionContextExtension<TOptions>
> {
  async function evaluatePermission(
    actor: NonNullable<ActorForResolve<TOptions>>,
    check: AnyCheck<unknown>,
  ): Promise<boolean> {
    try {
      return !!runCheck(actor, check as AnyCheck<NonNullable<ActorForResolve<TOptions>>>)
    } catch (error) {
      if (error instanceof ConvexError) return false
      throw error
    }
  }

  const projectedPermissions = options.permissions.filter(
    (permission) => permission.project !== false,
  ) as ProjectedPermissionDefinitions<TOptions['permissions']>[]

  return {
    args: {},
    guard: open,
    permissions: options.permissions,
    handler: async (ctx: MergedCtx<TOptions>) => {
      const actor = await options.resolve(ctx as ResolveCtx<TOptions>)
      if (!actor) return null
      const resolvedActor = actor as NonNullable<ActorForResolve<TOptions>>

      const permissions = Object.fromEntries(
        await Promise.all(
          projectedPermissions.map(async (permission) => [
            permission.key,
            await evaluatePermission(resolvedActor, permission.check as AnyCheck<unknown>),
          ]),
        ),
      ) as PermissionFlags<TOptions['permissions']>

      const actorObj = resolvedActor as Record<string, unknown>
      const base: PermissionContextBase<PermissionFlags<TOptions['permissions']>> = {
        userId: typeof actorObj.userId === 'string' ? actorObj.userId : null,
        tenantId: typeof actorObj.tenantId === 'string' ? actorObj.tenantId : null,
        role: typeof actorObj.role === 'string' ? actorObj.role : null,
        can: permissions,
      }

      if (!options.extend) {
        return base as PermissionContextHandlerResult<
          TOptions['permissions'],
          PermissionContextExtension<TOptions>
        >
      }

      const extra = await options.extend(ctx, resolvedActor)
      assertNoReservedExtensionKeys(extra)

      return {
        ...base,
        ...extra,
      } as PermissionContextHandlerResult<
        TOptions['permissions'],
        PermissionContextExtension<TOptions>
      >
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

export type { PermissionFlags }

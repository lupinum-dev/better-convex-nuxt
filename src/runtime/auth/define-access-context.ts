/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from 'convex/values'

import type { NoInfer } from '../types/type-utils.js'
import { open, runCheck, type AnyCheck } from './define-guard.js'
import type { ErasedPermissionDefinition } from './define-permission.js'

export type AccessContextBase<TCan extends Record<string, boolean>> = {
  userId: string | null
  workspaceId: string | null
  role: string | null
  can: TCan
}

type AccessContextReservedKey = keyof AccessContextBase<Record<string, boolean>>
type AccessContextExtensionShape = Record<string, unknown> & {
  userId?: never
  workspaceId?: never
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

type AccessContextHandlerResult<
  TPermissions extends PermissionTuple,
  TContext extends Record<string, unknown>,
> = AccessContextBase<PermissionFlags<TPermissions>> & TContext

type AccessContextOptions = {
  resolve: (ctx: any) => Promise<unknown | null>
  permissions: PermissionTuple
  extend?: (
    ctx: any,
    appIdentity: any,
  ) => Promise<AccessContextExtensionShape> | AccessContextExtensionShape
}

type ResolveCtx<TOptions extends AccessContextOptions> = Parameters<TOptions['resolve']>[0]
type AppIdentityForResolve<TOptions extends AccessContextOptions> = Awaited<
  ReturnType<TOptions['resolve']>
>
type ExtendCtx<TOptions extends AccessContextOptions> = TOptions extends {
  extend: (ctx: infer TCtx, appIdentity: any) => any
}
  ? TCtx
  : unknown
type MergedCtx<TOptions extends AccessContextOptions> = ResolveCtx<TOptions> & ExtendCtx<TOptions>

type AccessContextExtension<TOptions extends AccessContextOptions> = TOptions extends {
  extend: (...args: any[]) => infer TResult
}
  ? Awaited<TResult> extends AccessContextExtensionShape
    ? Awaited<TResult>
    : Record<string, never>
  : Record<string, never>

type PermissionRecord<TContext extends AccessContextBase<Record<string, boolean>>> =
  NonNullable<TContext['can']> extends Record<string, boolean>
    ? NonNullable<TContext['can']>
    : Record<string, boolean>

export type PermissionKey<TContext extends AccessContextBase<Record<string, boolean>>> =
  string extends keyof PermissionRecord<TContext>
    ? string
    : Extract<keyof PermissionRecord<TContext>, string>

export type ValidatePermissionKey<
  TContext extends AccessContextBase<Record<string, boolean>>,
  TKey extends string = string,
> = TKey extends NoInfer<PermissionKey<TContext>> ? TKey : never

export type AccessContextDefinition<
  TCtx,
  TPermissions extends PermissionTuple,
  TContext extends Record<string, unknown>,
> = {
  args: Record<string, never>
  guard: typeof open
  permissions: TPermissions
  handler: (ctx: TCtx) => Promise<AccessContextHandlerResult<TPermissions, TContext> | null>
}

export type InferAccessContext<
  TDefinition extends AccessContextDefinition<any, PermissionTuple, Record<string, unknown>>,
> = NonNullable<Awaited<ReturnType<TDefinition['handler']>>>

export function defineAccessContext<TOptions extends AccessContextOptions>(
  options: TOptions,
): AccessContextDefinition<
  MergedCtx<TOptions>,
  TOptions['permissions'],
  AccessContextExtension<TOptions>
> {
  async function evaluatePermission(
    appIdentity: NonNullable<AppIdentityForResolve<TOptions>>,
    check: AnyCheck<unknown>,
  ): Promise<boolean> {
    try {
      return !!runCheck(
        appIdentity,
        check as AnyCheck<NonNullable<AppIdentityForResolve<TOptions>>>,
      )
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
      const appIdentity = await options.resolve(ctx as ResolveCtx<TOptions>)
      if (!appIdentity) return null
      const resolvedActor = appIdentity as NonNullable<AppIdentityForResolve<TOptions>>

      const permissions = Object.fromEntries(
        await Promise.all(
          projectedPermissions.map(async (permission) => [
            permission.key,
            await evaluatePermission(resolvedActor, permission.check as AnyCheck<unknown>),
          ]),
        ),
      ) as PermissionFlags<TOptions['permissions']>

      const actorObj = resolvedActor as Record<string, unknown>
      const base: AccessContextBase<PermissionFlags<TOptions['permissions']>> = {
        userId: typeof actorObj.userId === 'string' ? actorObj.userId : null,
        workspaceId: typeof actorObj.workspaceId === 'string' ? actorObj.workspaceId : null,
        role: typeof actorObj.role === 'string' ? actorObj.role : null,
        can: permissions,
      }

      if (!options.extend) {
        return base as AccessContextHandlerResult<
          TOptions['permissions'],
          AccessContextExtension<TOptions>
        >
      }

      const extra = await options.extend(ctx, resolvedActor)
      assertNoReservedExtensionKeys(extra)

      return {
        ...base,
        ...extra,
      } as AccessContextHandlerResult<TOptions['permissions'], AccessContextExtension<TOptions>>
    },
  }
}

function assertNoReservedExtensionKeys(extra: AccessContextExtensionShape) {
  const reservedKeys: AccessContextReservedKey[] = ['userId', 'workspaceId', 'role', 'can']

  for (const key of reservedKeys) {
    if (key in extra) {
      throw new Error(
        `defineAccessContext.extend() cannot return reserved key "${key}". ` +
          'Use permissions for recordAccess projection and extend only for additional context.',
      )
    }
  }
}

export type { PermissionFlags }

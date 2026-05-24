/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import { ConvexError } from 'convex/values'

import type { Subject } from '../functions/define-caller.js'
import { getForwardedActingFor, getForwardedCaller } from '../identity-forwarding/index.js'
import { getAuth } from './index.js'
import { getSubjectValue } from './subject.js'

/**
 * The default appIdentity shape provided by the module.
 * Convention-based: reads `role` and `workspaceId` from the user row if present.
 */
export type DefaultAppIdentity = {
  kind: 'user'
  userId: string
  authKey: string
  role: string
  workspaceId?: string
}

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

function hasDb<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): ctx is GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> {
  return 'db' in ctx
}

type ResolvedAppIdentityRecord<TActor, TUser> = {
  appIdentity: TActor
  user: TUser
}

type ResolveAppIdentityRecord<TCtx, TActor, TUser> = (
  ctx: TCtx,
) => Promise<ResolvedAppIdentityRecord<TActor, TUser> | null>

interface AppIdentityExtensionOptions<TExtra extends Record<string, unknown>> {
  fields: (ctx: any, user: any, appIdentity?: any) => Promise<TExtra> | TExtra
}

export interface AppIdentityBuilder<TCtx, TUser, TActor> {
  readonly type: TActor
  resolve: (ctx: TCtx) => Promise<TActor | null>
  extend: <TExtra extends Record<string, unknown>>(
    options: AppIdentityExtensionOptions<TExtra> & {
      fields: (ctx: TCtx, user: TUser, appIdentity: TActor) => Promise<TExtra> | TExtra
    },
  ) => AppIdentityBuilder<TCtx, TUser, TActor & TExtra>
  filter: {
    <TNarrow extends TActor>(
      predicate: (appIdentity: TActor) => appIdentity is TNarrow,
    ): AppIdentityBuilder<TCtx, TUser, TNarrow>
    (predicate: (appIdentity: TActor) => boolean): AppIdentityBuilder<TCtx, TUser, TActor>
  }
}

function resolveForwardedUserId<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): string | null {
  const forwardedActingFor = getForwardedActingFor<{ subject: Subject }>(ctx)
  const delegatedUserId = getSubjectValue(forwardedActingFor?.subject, 'user')
  if (delegatedUserId) {
    return delegatedUserId
  }

  const forwardedCaller = getForwardedCaller<{ subject: Subject }>(ctx)
  const principalUserId = getSubjectValue(forwardedCaller?.subject, 'user')
  if (principalUserId) {
    return principalUserId
  }

  return null
}

async function resolveDefaultUser<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): Promise<Record<string, unknown> | null> {
  if (!hasDb(ctx)) return null

  const forwardedUserId = resolveForwardedUserId(ctx)
  if (forwardedUserId) {
    const forwardedUser = await (ctx.db as any).get(forwardedUserId)
    if (!forwardedUser) {
      throw new ConvexError({
        code: 'NOT_FOUND' as const,
        message: `Expected a Trellis users row for forwarded app user "${forwardedUserId}", but none was found.`,
      })
    }
    return forwardedUser
  }

  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await (ctx.db as any)
    .query('users')
    .withIndex('by_auth_key', (q: any) => q.eq('authKey', auth.authKey))
    .first()

  if (!user) {
    throw new ConvexError({
      code: 'NOT_FOUND' as const,
      message: [
        `Expected a Trellis users row for auth key "${auth.authKey}", but none was found.`,
        'Ensure the built-in Trellis auth bootstrap mutation is exported and enabled.',
      ].join(' '),
    })
  }

  return user
}

function requireAuthKey(user: Record<string, unknown>): string {
  if (typeof user.authKey === 'string' && user.authKey.trim().length > 0) {
    return user.authKey
  }

  throw new ConvexError({
    code: 'NOT_FOUND' as const,
    message: 'Expected Trellis users row to contain authKey.',
  })
}

function createAppIdentityBuilder<TCtx, TUser, TActor>(
  resolveRecord: ResolveAppIdentityRecord<TCtx, TActor, TUser>,
): AppIdentityBuilder<TCtx, TUser, TActor> {
  function resolve(ctx: TCtx) {
    return resolveRecord(ctx).then((resolved) => resolved?.appIdentity ?? null)
  }

  function extend<TExtra extends Record<string, unknown>>(
    options: AppIdentityExtensionOptions<TExtra> & {
      fields: (ctx: TCtx, user: TUser, appIdentity: TActor) => Promise<TExtra> | TExtra
    },
  ): AppIdentityBuilder<TCtx, TUser, TActor & TExtra> {
    return createAppIdentityBuilder<TCtx, TUser, TActor & TExtra>(async (ctx) => {
      const resolved = await resolveRecord(ctx)
      if (!resolved) return null

      const extra = await options.fields(ctx, resolved.user, resolved.appIdentity)
      return {
        user: resolved.user,
        appIdentity: {
          ...resolved.appIdentity,
          ...extra,
        },
      }
    })
  }

  function filter<TNarrow extends TActor>(
    predicate:
      | ((appIdentity: TActor) => boolean)
      | ((appIdentity: TActor) => appIdentity is TNarrow),
  ): AppIdentityBuilder<TCtx, TUser, TNarrow> {
    return createAppIdentityBuilder<TCtx, TUser, TNarrow>(async (ctx) => {
      const resolved = await resolveRecord(ctx)
      if (!resolved) return null
      if (!predicate(resolved.appIdentity)) return null
      return resolved as ResolvedAppIdentityRecord<TNarrow, TUser>
    })
  }

  return {
    type: null as unknown as TActor,
    resolve,
    extend,
    filter: filter as AppIdentityBuilder<TCtx, TUser, TActor>['filter'],
  }
}

export const defineAppIdentity = {
  fromAuth<DataModel extends GenericDataModel = GenericDataModel>() {
    return createAppIdentityBuilder<AnyCtx<DataModel>, Record<string, unknown>, DefaultAppIdentity>(
      async (ctx) => {
        const user = await resolveDefaultUser(ctx)
        if (!user) return null

        return {
          user,
          appIdentity: {
            kind: 'user',
            userId: String(user._id),
            authKey: requireAuthKey(user),
            role: typeof user.role === 'string' ? user.role : 'member',
            ...(user.workspaceId ? { workspaceId: String(user.workspaceId) } : {}),
          },
        }
      },
    )
  },

  fromMembership<DataModel extends GenericDataModel = GenericDataModel>(options: {
    membershipTable: string
    roleField: string
    workspaceField?: string
  }) {
    const { membershipTable, roleField, workspaceField = 'workspaceId' } = options

    return createAppIdentityBuilder<AnyCtx<DataModel>, Record<string, unknown>, DefaultAppIdentity>(
      async (ctx) => {
        const user = await resolveDefaultUser(ctx)
        if (!user) return null
        if (!hasDb(ctx)) return null

        const membership = await (ctx.db as any)
          .query(membershipTable)
          .withIndex('by_user', (q: any) => q.eq('userId', user._id))
          .first()

        if (!membership) return null

        return {
          user,
          appIdentity: {
            kind: 'user',
            userId: String(user._id),
            authKey: requireAuthKey(user),
            role: String(membership[roleField]),
            workspaceId: membership[workspaceField]
              ? String(membership[workspaceField])
              : undefined,
          },
        }
      },
    )
  },
}

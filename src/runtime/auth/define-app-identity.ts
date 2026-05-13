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
import { getAuth, type AuthIdentity } from './index.js'
import { getSubjectValue } from './subject.js'

/**
 * The default appIdentity shape provided by the module.
 * Convention-based: reads `role` and `workspaceId` from the user row if present.
 */
export type DefaultAppIdentity = {
  kind: 'user'
  userId: string
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

async function resolveAuthIdentity<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): Promise<AuthIdentity | null> {
  const forwardedActingFor = getForwardedActingFor<{ subject: Subject }>(ctx)
  const delegatedUserId = getSubjectValue(forwardedActingFor?.subject, 'user')
  if (delegatedUserId) {
    return { subject: delegatedUserId }
  }

  const forwardedCaller = getForwardedCaller<{ subject: Subject }>(ctx)
  const principalUserId = getSubjectValue(forwardedCaller?.subject, 'user')
  if (principalUserId) {
    return { subject: principalUserId }
  }

  return await getAuth(ctx)
}

async function resolveDefaultUser<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): Promise<Record<string, unknown> | null> {
  const auth = await resolveAuthIdentity(ctx)
  if (!auth) return null
  if (!hasDb(ctx)) return null

  const user = await (ctx.db as any)
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', auth.subject))
    .first()

  if (!user) {
    throw new ConvexError({
      code: 'NOT_FOUND' as const,
      message: [
        `Expected a Trellis users row for auth subject "${auth.subject}", but none was found.`,
        'Ensure your Trellis auth bridge exports authComponent.triggersApi() and the built-in auth bootstrap is enabled.',
      ].join(' '),
    })
  }

  return user
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
            userId: String(user.authId),
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
            userId: String(user.authId),
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

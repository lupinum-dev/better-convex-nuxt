/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { getTrustedCaller } from '../trusted-caller/index.js'
import { getAuth, type AuthIdentity } from './index.js'

/**
 * The default actor shape provided by the module.
 * Convention-based: reads `role` and `workspaceId` from the user row if present.
 */
export type DefaultActor = {
  kind: 'user'
  userId: string
  role: string
  tenantId?: string
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

type ResolvedActorRecord<TActor, TUser> = {
  actor: TActor
  user: TUser
}

type ResolveActorRecord<TCtx, TActor, TUser> = (
  ctx: TCtx,
) => Promise<ResolvedActorRecord<TActor, TUser> | null>

interface ActorExtensionOptions<TExtra extends Record<string, unknown>> {
  fields: (ctx: any, user: any, actor?: any) => Promise<TExtra> | TExtra
}

export interface ActorBuilder<TCtx, TUser, TActor> {
  readonly type: TActor
  resolve: (ctx: TCtx) => Promise<TActor | null>
  extend: <TExtra extends Record<string, unknown>>(
    options: ActorExtensionOptions<TExtra> & {
      fields: (ctx: TCtx, user: TUser, actor: TActor) => Promise<TExtra> | TExtra
    },
  ) => ActorBuilder<TCtx, TUser, TActor & TExtra>
  filter: {
    <TNarrow extends TActor>(
      predicate: (actor: TActor) => actor is TNarrow,
    ): ActorBuilder<TCtx, TUser, TNarrow>
    (predicate: (actor: TActor) => boolean): ActorBuilder<TCtx, TUser, TActor>
  }
}

async function resolveAuthIdentity<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): Promise<AuthIdentity | null> {
  const trusted = getTrustedCaller(ctx)
  return trusted ? { subject: trusted.userId } : await getAuth(ctx)
}

async function resolveDefaultUser<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): Promise<Record<string, unknown> | null> {
  const auth = await resolveAuthIdentity(ctx)
  if (!auth) return null
  if (!hasDb(ctx)) return null

  return await (ctx.db as any)
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', auth.subject))
    .first()
}

function createActorBuilder<TCtx, TUser, TActor>(
  resolveRecord: ResolveActorRecord<TCtx, TActor, TUser>,
): ActorBuilder<TCtx, TUser, TActor> {
  function resolve(ctx: TCtx) {
    return resolveRecord(ctx).then((resolved) => resolved?.actor ?? null)
  }

  function extend<TExtra extends Record<string, unknown>>(
    options: ActorExtensionOptions<TExtra> & {
      fields: (ctx: TCtx, user: TUser, actor: TActor) => Promise<TExtra> | TExtra
    },
  ): ActorBuilder<TCtx, TUser, TActor & TExtra> {
    return createActorBuilder<TCtx, TUser, TActor & TExtra>(async (ctx) => {
      const resolved = await resolveRecord(ctx)
      if (!resolved) return null

      const extra = await options.fields(ctx, resolved.user, resolved.actor)
      return {
        user: resolved.user,
        actor: {
          ...resolved.actor,
          ...extra,
        },
      }
    })
  }

  function filter<TNarrow extends TActor>(
    predicate: ((actor: TActor) => boolean) | ((actor: TActor) => actor is TNarrow),
  ): ActorBuilder<TCtx, TUser, TNarrow> {
    return createActorBuilder<TCtx, TUser, TNarrow>(async (ctx) => {
      const resolved = await resolveRecord(ctx)
      if (!resolved) return null
      if (!predicate(resolved.actor)) return null
      return resolved as ResolvedActorRecord<TNarrow, TUser>
    })
  }

  return {
    type: null as unknown as TActor,
    resolve,
    extend,
    filter: filter as ActorBuilder<TCtx, TUser, TActor>['filter'],
  }
}

export const defineActor = {
  fromAuth<DataModel extends GenericDataModel = GenericDataModel>() {
    return createActorBuilder<AnyCtx<DataModel>, Record<string, unknown>, DefaultActor>(
      async (ctx) => {
        const user = await resolveDefaultUser(ctx)
        if (!user) return null

        return {
          user,
          actor: {
            kind: 'user',
            userId: String(user.authId),
            role: typeof user.role === 'string' ? user.role : 'member',
            ...(user.workspaceId ? { tenantId: String(user.workspaceId) } : {}),
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

    return createActorBuilder<AnyCtx<DataModel>, Record<string, unknown>, DefaultActor>(
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
          actor: {
            kind: 'user',
            userId: String(user.authId),
            role: String(membership[roleField]),
            tenantId: membership[workspaceField] ? String(membership[workspaceField]) : undefined,
          },
        }
      },
    )
  },
}

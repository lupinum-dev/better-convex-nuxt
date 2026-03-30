import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { GenericId, ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import { createScopedReader, createScopedWriter } from '../../../src/runtime/scoping/scoped-db'
import type { DataModel, Id } from '../_generated/dataModel'
import { mutation, query } from '../_generated/server'
import { checkPermission, type Permission, type Resource, type Role } from '../permissions.config'

type QueryCtx = GenericQueryCtx<DataModel>
type MutationCtx = GenericMutationCtx<DataModel>
type AnyCtx = QueryCtx | MutationCtx

type Actor = {
  userId: string
  role: Role
  orgId?: string
}

type ServiceArgs = {
  _serviceKey?: string
  _serviceActor?: Actor
}

type ResourceRef = GenericId<string> | { table: string; id: GenericId<string> }

type ScopedTablesConfig = Record<string, { scoped?: boolean; ownerField?: string }>

type PublicHandler<TCtx extends AnyCtx, Args> = (
  ctx: { db: TCtx['db'] },
  args: Args,
) => Promise<unknown>

type AuthedHandler<TCtx extends AnyCtx, Args> = (
  ctx: { db: TCtx['db']; actor: Actor },
  args: Args,
) => Promise<unknown>

type ScopedHandler<TCtx extends AnyCtx, Args> = (
  ctx: {
    db: TCtx extends MutationCtx
      ? ReturnType<typeof createScopedWriter>
      : ReturnType<typeof createScopedReader>
    actor: Actor & { orgId: string }
    raw: { ctx: TCtx }
    resource?: Record<string, unknown>
  },
  args: Args,
) => Promise<unknown>

const serviceAuthArgs = {
  _serviceKey: v.optional(v.string()),
  _serviceActor: v.optional(
    v.object({
      userId: v.string(),
      role: v.union(
        v.literal('owner'),
        v.literal('admin'),
        v.literal('member'),
        v.literal('viewer'),
      ),
      orgId: v.optional(v.string()),
    }),
  ),
} as const

function stripServiceArgs<T extends Record<string, unknown>>(args: T): Omit<T, keyof ServiceArgs> {
  const { _serviceKey: _key, _serviceActor: _actor, ...clean } = args
  return clean as Omit<T, keyof ServiceArgs>
}

function resolveActor(args: ServiceArgs, required: boolean): Actor | null {
  if (!args._serviceActor) {
    if (required) throw new Error('Authentication required.')
    return null
  }

  if (args._serviceKey !== 'test-service-key') {
    throw new Error('Invalid service key.')
  }

  return args._serviceActor
}

function resolveTableFromId(
  ctx: AnyCtx,
  id: GenericId<string>,
  tables: readonly string[],
): string | null {
  const rawId = String(id)
  for (const table of tables) {
    if (ctx.db.normalizeId(table as never, rawId) !== null) {
      return table
    }
  }
  return null
}

async function loadResource(
  ctx: AnyCtx,
  actor: Actor & { orgId: string },
  orgField: string,
  tables: ScopedTablesConfig,
  resolve: (args: Record<string, unknown>) => ResourceRef,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const target = resolve(args)
  const resourceId =
    typeof target === 'object' && target !== null && 'id' in target ? target.id : target
  const explicitTable =
    typeof target === 'object' && target !== null && 'table' in target ? target.table : null
  const knownTables = Object.keys(tables)
  const table = explicitTable ?? resolveTableFromId(ctx, resourceId, knownTables)

  const doc = await ctx.db.get(resourceId)
  if (!doc) {
    throw new Error('Resource not found.')
  }

  if (table && tables[table]?.scoped && orgField in doc && doc[orgField] !== actor.orgId) {
    throw new Error('Document belongs to a different organization.')
  }

  return doc as Record<string, unknown>
}

function createFunctions(config: { orgField: string; tables: ScopedTablesConfig }) {
  const scopedTables = Object.entries(config.tables)
    .filter(([, meta]) => meta.scoped)
    .map(([table]) => table)

  function publicQuery<ArgsValidator extends PropertyValidators>(options: {
    args: ArgsValidator
    handler: PublicHandler<QueryCtx, ObjectType<ArgsValidator>>
  }) {
    return query({
      args: options.args,
      handler: async (ctx, args) => {
        return await options.handler({ db: ctx.db }, args)
      },
    })
  }

  function publicMutation<ArgsValidator extends PropertyValidators>(options: {
    args: ArgsValidator
    handler: PublicHandler<MutationCtx, ObjectType<ArgsValidator>>
  }) {
    return mutation({
      args: options.args,
      handler: async (ctx, args) => {
        return await options.handler({ db: ctx.db }, args)
      },
    })
  }

  function authedQuery<ArgsValidator extends PropertyValidators>(options: {
    args: ArgsValidator
    handler: AuthedHandler<QueryCtx, ObjectType<ArgsValidator>>
  }) {
    return query({
      args: { ...options.args, ...serviceAuthArgs },
      handler: async (ctx, args) => {
        const actor = resolveActor(args, true)
        return await options.handler({ db: ctx.db, actor }, stripServiceArgs(args))
      },
    })
  }

  function authedMutation<ArgsValidator extends PropertyValidators>(options: {
    args: ArgsValidator
    handler: AuthedHandler<MutationCtx, ObjectType<ArgsValidator>>
  }) {
    return mutation({
      args: { ...options.args, ...serviceAuthArgs },
      handler: async (ctx, args) => {
        const actor = resolveActor(args, true)
        return await options.handler({ db: ctx.db, actor }, stripServiceArgs(args))
      },
    })
  }

  function scopedQuery<ArgsValidator extends PropertyValidators>(options: {
    args: ArgsValidator
    require?: Permission
    resource?: (args: ObjectType<ArgsValidator>) => ResourceRef
    handler: ScopedHandler<QueryCtx, ObjectType<ArgsValidator>>
  }) {
    return query({
      args: { ...options.args, ...serviceAuthArgs },
      handler: async (ctx, args) => {
        const actor = resolveActor(args, true)
        if (!actor?.orgId) throw new Error('Organization required.')
        const cleanArgs = stripServiceArgs(args)
        const resource = options.resource
          ? await loadResource(
              ctx,
              actor as Actor & { orgId: string },
              config.orgField,
              config.tables,
              options.resource as never,
              cleanArgs,
            )
          : undefined

        if (options.require) {
          const allowed = checkPermission(
            { role: actor.role, userId: actor.userId },
            options.require,
            resource as Resource | undefined,
          )
          if (!allowed) {
            throw new Error(`Forbidden: ${options.require}`)
          }
        }

        return await options.handler(
          {
            db: createScopedReader(ctx.db, actor.orgId, config.orgField, scopedTables),
            actor: actor as Actor & { orgId: string },
            raw: { ctx },
            ...(resource ? { resource } : {}),
          },
          cleanArgs,
        )
      },
    })
  }

  function scopedMutation<ArgsValidator extends PropertyValidators>(options: {
    args: ArgsValidator
    require?: Permission
    resource?: (args: ObjectType<ArgsValidator>) => ResourceRef
    handler: ScopedHandler<MutationCtx, ObjectType<ArgsValidator>>
  }) {
    return mutation({
      args: { ...options.args, ...serviceAuthArgs },
      handler: async (ctx, args) => {
        const actor = resolveActor(args, true)
        if (!actor?.orgId) throw new Error('Organization required.')
        const cleanArgs = stripServiceArgs(args)
        const resource = options.resource
          ? await loadResource(
              ctx,
              actor as Actor & { orgId: string },
              config.orgField,
              config.tables,
              options.resource as never,
              cleanArgs,
            )
          : undefined

        if (options.require) {
          const allowed = checkPermission(
            { role: actor.role, userId: actor.userId },
            options.require,
            resource as Resource | undefined,
          )
          if (!allowed) {
            throw new Error(`Forbidden: ${options.require}`)
          }
        }

        return await options.handler(
          {
            db: createScopedWriter(ctx.db, actor.orgId, config.orgField, scopedTables),
            actor: actor as Actor & { orgId: string },
            raw: { ctx },
            ...(resource ? { resource } : {}),
          },
          cleanArgs,
        )
      },
    })
  }

  return {
    publicQuery,
    publicMutation,
    authedQuery,
    authedMutation,
    scopedQuery,
    scopedMutation,
  }
}

const { publicQuery, authedQuery, scopedQuery, scopedMutation } = createFunctions({
  orgField: 'organizationId',
  tables: {
    posts: { scoped: true, ownerField: 'ownerId' },
    comments: { scoped: true, ownerField: 'ownerId' },
    notes: {},
    tasks: {},
  },
})

export const listNotes = publicQuery({
  args: {},
  handler: async ({ db }) => {
    return await db.query('notes').order('desc').take(50)
  },
})

export const listMyTasks = authedQuery({
  args: {},
  handler: async ({ db, actor }) => {
    return await db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', actor.userId))
      .collect()
  },
})

export const listPosts = scopedQuery({
  args: {},
  handler: async ({ db }) => {
    return await db.query('posts').order('desc').collect()
  },
})

export const createPost = scopedMutation({
  args: {
    title: v.string(),
    content: v.string(),
  },
  require: 'post.create',
  handler: async ({ db, actor }, args) => {
    return await db.insert('posts', {
      ...args,
      status: 'draft',
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const updatePost = scopedMutation({
  args: {
    id: v.id('posts'),
    title: v.optional(v.string()),
  },
  require: 'post.update',
  resource: (args) => args.id,
  handler: async ({ db, resource }, args) => {
    await db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      updatedAt: Date.now(),
    })

    return {
      updated: true,
      ownerId: resource?.ownerId,
    }
  },
})

export const createCommentOnOwnedPost = scopedMutation({
  args: {
    postId: v.id('posts'),
    content: v.string(),
  },
  require: 'post.update',
  resource: (args) => ({ table: 'posts', id: args.postId }),
  handler: async ({ db, actor, resource }, args) => {
    const commentId = await db.insert('comments', {
      postId: args.postId as Id<'posts'>,
      content: args.content,
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    return {
      commentId,
      postOwnerId: resource?.ownerId,
    }
  },
})

export const countPostsWithRaw = scopedQuery({
  args: {},
  handler: async ({ db, raw }) => {
    const scopedPosts = await db.query('posts').collect()
    const rawPosts = await raw.ctx.db.query('posts').collect()

    return {
      scopedCount: scopedPosts.length,
      rawCount: rawPosts.length,
    }
  },
})

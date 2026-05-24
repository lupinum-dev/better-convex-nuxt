import { customQuery, customMutation } from 'convex-helpers/server/customFunctions'
import { wrapDatabaseReader, wrapDatabaseWriter } from 'convex-helpers/server/rowLevelSecurity'
import { v } from 'convex/values'

/**
 * Experiment 3: Value-Based ctx + Raw DB Resolution
 *
 * Validates that caller/appIdentity can be resolved eagerly in
 * customQuery's input phase and appear as plain values on ctx.
 */
import {
  query as rawQuery,
  mutation as rawMutation,
  internalQuery as rawInternalQuery,
} from './_generated/server'
import type { QueryCtx } from './_generated/server'

// ---- Types ----
type Caller =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'service'; service: string }

type AppIdentity = {
  userId: string
  workspaceId: string
  role: string
}

// ---- Resolution functions (use raw db) ----
async function resolveCaller(ctx: QueryCtx): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return { kind: 'anonymous' }
  return { kind: 'user', userId: identity.tokenIdentifier }
}

async function resolveActor(ctx: QueryCtx, caller: Caller): Promise<AppIdentity | null> {
  if (caller.kind === 'anonymous') return null
  if (caller.kind === 'service') return null
  // Use raw ctx.db — no RLS wrapping during resolution
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q) => q.eq('authKey', caller.userId))
    .first()
  if (!user || !user.organizationId) return null
  return {
    userId: caller.userId,
    workspaceId: user.organizationId as string,
    role: user.role,
  }
}

// ---- RLS rules that close over resolved appIdentity value ----
function buildTenantRules(appIdentity: AppIdentity) {
  return {
    posts: {
      read: async (_ctx: QueryCtx, doc: any) => doc.organizationId === appIdentity.workspaceId,
      insert: async (_ctx: QueryCtx, doc: any) => doc.organizationId === appIdentity.workspaceId,
      modify: async (_ctx: QueryCtx, doc: any) => doc.organizationId === appIdentity.workspaceId,
    },
  }
}

// ---- Custom query builder: appIdentity REQUIRED (like spec's `query`) ----
const trellisQuery = customQuery(rawQuery, {
  args: {},
  input: async (ctx, _args) => {
    const caller = await resolveCaller(ctx)
    const appIdentity = await resolveActor(ctx, caller)

    // AppIdentity required — throw if null
    if (!appIdentity) {
      throw new Error('Unauthorized: appIdentity required')
    }

    // Build RLS rules that capture appIdentity VALUE (not accessor)
    const rules = buildTenantRules(appIdentity)
    const db = wrapDatabaseReader(ctx, ctx.db, rules, { defaultPolicy: 'deny' })

    return {
      ctx: {
        caller,
        appIdentity,
        db,
        unsafeDb: ctx.db,
        rawDb: ctx.db,
      },
      args: {},
    }
  },
})

// ---- Custom query builder: appIdentity OPTIONAL (like spec's `publicQuery`) ----
const trellisPublicQuery = customQuery(rawQuery, {
  args: {},
  input: async (ctx, _args) => {
    const caller = await resolveCaller(ctx)
    const appIdentity = await resolveActor(ctx, caller)

    // AppIdentity optional — null is fine
    const rules = appIdentity ? buildTenantRules(appIdentity) : {}
    const db = wrapDatabaseReader(ctx, ctx.db, rules, { defaultPolicy: 'deny' })

    return {
      ctx: {
        caller,
        appIdentity, // AppIdentity | null
        db,
        unsafeDb: ctx.db,
        rawDb: ctx.db,
      },
      args: {},
    }
  },
})

// ---- Custom mutation builder: appIdentity REQUIRED ----
const trellisMutation = customMutation(rawMutation, {
  args: {},
  input: async (ctx, _args) => {
    const caller = await resolveCaller(ctx)
    const appIdentity = await resolveActor(ctx, caller)

    if (!appIdentity) {
      throw new Error('Unauthorized: appIdentity required')
    }

    const rules = buildTenantRules(appIdentity)
    const db = wrapDatabaseWriter(ctx, ctx.db, rules, { defaultPolicy: 'deny' })

    return {
      ctx: {
        caller,
        appIdentity,
        db,
        unsafeDb: ctx.db,
        rawDb: ctx.db,
      },
      args: {},
    }
  },
})

// ---- Exported functions for testing ----

// Test 3a: Handler gets caller and appIdentity as VALUES
export const getPrincipalAndActor = trellisQuery({
  args: {},
  handler: async (ctx, _args) => {
    // These should be plain values, not functions
    const principalType = typeof ctx.caller
    const actorType = typeof ctx.appIdentity

    return {
      principalIsValue: principalType === 'object',
      actorIsValue: actorType === 'object',
      principalKind: ctx.caller.kind,
      actorUserId: ctx.appIdentity.userId,
      appIdentityWorkspaceId: ctx.appIdentity.workspaceId,
      actorRole: ctx.appIdentity.role,
    }
  },
})

// Test 3b: Handler reads posts via RLS-wrapped db — tenant scoped
export const getMyPosts = trellisQuery({
  args: {},
  handler: async (ctx, _args) => {
    const posts = await ctx.db.query('posts').collect()
    return {
      count: posts.length,
      titles: posts.map((p: any) => p.title),
      appIdentityWorkspaceId: ctx.appIdentity.workspaceId,
    }
  },
})

// Test 3c: Public query — appIdentity is null for anonymous
export const getPublicInfo = trellisPublicQuery({
  args: {},
  handler: async (ctx, _args) => {
    return {
      principalKind: ctx.caller.kind,
      actorIsNull: ctx.appIdentity === null,
      // With null appIdentity and deny-by-default, db queries return nothing
      // (which is the expected behavior)
    }
  },
})

// Test 3d: Required appIdentity query called without auth — should throw
export const requiresAuth = trellisQuery({
  args: {},
  handler: async (ctx, _args) => {
    return { appIdentity: ctx.appIdentity }
  },
})

// Test 3e: Mutation with appIdentity — write via RLS-wrapped db
export const createPostViaMutation = trellisMutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('posts', {
      title: args.title,
      content: 'Created via trellis mutation',
      status: 'draft',
      ownerId: ctx.appIdentity.userId,
      organizationId: ctx.appIdentity.workspaceId as any,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return { id: id as string, actorRole: ctx.appIdentity.role }
  },
})

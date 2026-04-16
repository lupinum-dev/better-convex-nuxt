/**
 * Experiment 3: Value-Based ctx + Raw DB Resolution
 *
 * Validates that principal/actor can be resolved eagerly in
 * customQuery's input phase and appear as plain values on ctx.
 */
import {
  query as rawQuery,
  mutation as rawMutation,
  internalQuery as rawInternalQuery,
} from './_generated/server'
import { v } from 'convex/values'
import { customQuery, customMutation } from 'convex-helpers/server/customFunctions'
import {
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from 'convex-helpers/server/rowLevelSecurity'
import type { QueryCtx } from './_generated/server'

// ---- Types ----
type Principal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'service'; service: string }

type Actor = {
  userId: string
  tenantId: string
  role: string
}

// ---- Resolution functions (use raw db) ----
async function resolvePrincipal(ctx: QueryCtx): Promise<Principal> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return { kind: 'anonymous' }
  return { kind: 'user', userId: identity.subject }
}

async function resolveActor(ctx: QueryCtx, principal: Principal): Promise<Actor | null> {
  if (principal.kind === 'anonymous') return null
  if (principal.kind === 'service') return null
  // Use raw ctx.db — no RLS wrapping during resolution
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', principal.userId))
    .first()
  if (!user || !user.organizationId) return null
  return {
    userId: principal.userId,
    tenantId: user.organizationId as string,
    role: user.role,
  }
}

// ---- RLS rules that close over resolved actor value ----
function buildTenantRules(actor: Actor) {
  return {
    posts: {
      read: async (_ctx: QueryCtx, doc: any) => doc.organizationId === actor.tenantId,
      insert: async (_ctx: QueryCtx, doc: any) => doc.organizationId === actor.tenantId,
      modify: async (_ctx: QueryCtx, doc: any) => doc.organizationId === actor.tenantId,
    },
  }
}

// ---- Custom query builder: actor REQUIRED (like spec's `query`) ----
const trellisQuery = customQuery(rawQuery, {
  args: {},
  input: async (ctx, _args) => {
    const principal = await resolvePrincipal(ctx)
    const actor = await resolveActor(ctx, principal)

    // Actor required — throw if null
    if (!actor) {
      throw new Error('Unauthorized: actor required')
    }

    // Build RLS rules that capture actor VALUE (not accessor)
    const rules = buildTenantRules(actor)
    const db = wrapDatabaseReader(ctx, ctx.db, rules, { defaultPolicy: 'deny' })

    return {
      ctx: {
        principal,
        actor,
        db,
        unsafeDb: ctx.db,
        rawDb: ctx.db,
      },
      args: {},
    }
  },
})

// ---- Custom query builder: actor OPTIONAL (like spec's `publicQuery`) ----
const trellisPublicQuery = customQuery(rawQuery, {
  args: {},
  input: async (ctx, _args) => {
    const principal = await resolvePrincipal(ctx)
    const actor = await resolveActor(ctx, principal)

    // Actor optional — null is fine
    const rules = actor ? buildTenantRules(actor) : {}
    const db = wrapDatabaseReader(ctx, ctx.db, rules, { defaultPolicy: 'deny' })

    return {
      ctx: {
        principal,
        actor,  // Actor | null
        db,
        unsafeDb: ctx.db,
        rawDb: ctx.db,
      },
      args: {},
    }
  },
})

// ---- Custom mutation builder: actor REQUIRED ----
const trellisMutation = customMutation(rawMutation, {
  args: {},
  input: async (ctx, _args) => {
    const principal = await resolvePrincipal(ctx)
    const actor = await resolveActor(ctx, principal)

    if (!actor) {
      throw new Error('Unauthorized: actor required')
    }

    const rules = buildTenantRules(actor)
    const db = wrapDatabaseWriter(ctx, ctx.db, rules, { defaultPolicy: 'deny' })

    return {
      ctx: {
        principal,
        actor,
        db,
        unsafeDb: ctx.db,
        rawDb: ctx.db,
      },
      args: {},
    }
  },
})

// ---- Exported functions for testing ----

// Test 3a: Handler gets principal and actor as VALUES
export const getPrincipalAndActor = trellisQuery({
  args: {},
  handler: async (ctx, _args) => {
    // These should be plain values, not functions
    const principalType = typeof ctx.principal
    const actorType = typeof ctx.actor

    return {
      principalIsValue: principalType === 'object',
      actorIsValue: actorType === 'object',
      principalKind: ctx.principal.kind,
      actorUserId: ctx.actor.userId,
      actorTenantId: ctx.actor.tenantId,
      actorRole: ctx.actor.role,
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
      actorTenantId: ctx.actor.tenantId,
    }
  },
})

// Test 3c: Public query — actor is null for anonymous
export const getPublicInfo = trellisPublicQuery({
  args: {},
  handler: async (ctx, _args) => {
    return {
      principalKind: ctx.principal.kind,
      actorIsNull: ctx.actor === null,
      // With null actor and deny-by-default, db queries return nothing
      // (which is the expected behavior)
    }
  },
})

// Test 3d: Required actor query called without auth — should throw
export const requiresAuth = trellisQuery({
  args: {},
  handler: async (ctx, _args) => {
    return { actor: ctx.actor }
  },
})

// Test 3e: Mutation with actor — write via RLS-wrapped db
export const createPostViaMutation = trellisMutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('posts', {
      title: args.title,
      content: 'Created via trellis mutation',
      status: 'draft',
      ownerId: ctx.actor.userId,
      organizationId: ctx.actor.tenantId as any,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return { id: id as string, actorRole: ctx.actor.role }
  },
})

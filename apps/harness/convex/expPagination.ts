import { wrapDatabaseReader } from 'convex-helpers/server/rowLevelSecurity'
import { v } from 'convex/values'

/**
 * Experiment 5: RLS + Pagination Interaction
 *
 * Tests what happens when .paginate() is called through an
 * RLS-wrapped database reader. Explores page sizes, cursor
 * continuity, and filtering behavior.
 */
import { internalMutation, internalQuery } from './_generated/server'
import type { QueryCtx } from './_generated/server'

// ---- RLS rules: filter posts by organizationId ----
function buildRlsRules(organizationId: string) {
  return {
    posts: {
      read: async (_ctx: QueryCtx, doc: any) => {
        return doc.organizationId === organizationId
      },
    },
  }
}

// ---- Seed: 20 posts, 10 per org ----
export const seedPosts = internalMutation({
  args: {
    org1Id: v.id('organizations'),
    org2Id: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    for (let i = 1; i <= 10; i++) {
      await ctx.db.insert('posts', {
        title: `Org1 Post ${i}`,
        content: `Content for org1 post ${i}`,
        status: 'published',
        ownerId: 'seed-user',
        organizationId: args.org1Id,
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i,
      })
    }
    for (let i = 1; i <= 10; i++) {
      await ctx.db.insert('posts', {
        title: `Org2 Post ${i}`,
        content: `Content for org2 post ${i}`,
        status: 'published',
        ownerId: 'seed-user',
        organizationId: args.org2Id,
        createdAt: Date.now() + 10 + i,
        updatedAt: Date.now() + 10 + i,
      })
    }
  },
})

// ---- Paginate with RLS ----
export const paginateWithRls = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    paginationOpts: v.any(),
  },
  handler: async (ctx, args) => {
    const rules = buildRlsRules(args.organizationId as string)
    const wrappedDb = wrapDatabaseReader(ctx, ctx.db, rules, {
      defaultPolicy: 'deny',
    })

    return await wrappedDb.query('posts').paginate(args.paginationOpts)
  },
})

// ---- Paginate raw (no RLS) ----
export const paginateRaw = internalQuery({
  args: {
    paginationOpts: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query('posts').paginate(args.paginationOpts)
  },
})

import { wrapDatabaseReader, wrapDatabaseWriter } from 'convex-helpers/server/rowLevelSecurity'
import { Triggers } from 'convex-helpers/server/triggers'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
/**
 * Experiment 2: Three-Door DB Model + Trigger Composition
 *
 * Validates that we can create three database wrappers with
 * different RLS/trigger compositions in the same mutation.
 */
import { mutation, query, internalMutation } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'

// ---- Trigger setup ----
// Module-level triggers instance (like the real implementation)
const triggers = new Triggers<DataModel>()

// Register a trigger on posts that logs to expTriggerLog
triggers.register('posts', async (ctx, change) => {
  if (change.operation === 'insert' || change.operation === 'update') {
    // Use innerDb to avoid trigger recursion
    await ctx.innerDb.insert('expTriggerLog', {
      table: 'posts',
      operation: change.operation,
      docId: change.id as string,
      // We'll detect which door by checking if we're in a door-tagged context
      door: 'unknown', // Will be overridden by the caller's tag
      timestamp: Date.now(),
    })
  }
})

// ---- RLS rules builder ----
function buildRlsRules(organizationId: string) {
  return {
    posts: {
      read: async (_ctx: QueryCtx, doc: any) => {
        return doc.organizationId === organizationId
      },
      insert: async (_ctx: QueryCtx, doc: any) => {
        return doc.organizationId === organizationId
      },
      modify: async (_ctx: QueryCtx, doc: any) => {
        return doc.organizationId === organizationId
      },
    },
  }
}

// ---- Test: Write via all three doors ----
export const writeViaThreeDoors = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    wrongOrgId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const rules = buildRlsRules(args.organizationId as string)

    // FINDING: Composition order matters!
    // Wrong: triggers.wrapDB({db: RLS}) → trigger's innerDb = RLS db → can't write audit tables
    // Right: wrapDatabaseWriter(ctx, triggers.wrapDB(ctx).db, rules) → trigger's innerDb = raw db
    //
    // Door 1: db = RLS(triggers(raw)) — RLS on outside, triggers on inside
    const triggerCtx1 = triggers.wrapDB(ctx)
    const door1Db = wrapDatabaseWriter(ctx, triggerCtx1.db, rules, { defaultPolicy: 'deny' })

    // Door 2: unsafeDb = triggers only (no RLS)
    const triggerCtx2 = triggers.wrapDB({ ...ctx, db: ctx.db })
    const door2Db = triggerCtx2.db

    // Door 3: rawDb = nothing
    const door3Db = ctx.db

    const results: Record<string, string> = {}

    // Test 1: Write via door1 (db) with matching org — should succeed + trigger
    const id1 = await door1Db.insert('posts', {
      title: 'Door 1 Post',
      content: 'Written via db (RLS+triggers)',
      status: 'draft',
      ownerId: 'test-user',
      organizationId: args.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    results.door1Success = id1 as string

    // Test 2: Write via door1 (db) with WRONG org — should fail (RLS denies)
    let door1WrongOrgError = ''
    try {
      await door1Db.insert('posts', {
        title: 'Door 1 Wrong Org',
        content: 'Should be denied by RLS',
        status: 'draft',
        ownerId: 'test-user',
        organizationId: args.wrongOrgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    } catch (e: any) {
      door1WrongOrgError = e.message || 'error'
    }
    results.door1WrongOrgError = door1WrongOrgError

    // Test 3: Write via door2 (unsafeDb) with wrong org — should succeed (no RLS) + trigger
    const id2 = await door2Db.insert('posts', {
      title: 'Door 2 Post',
      content: 'Written via unsafeDb (triggers only)',
      status: 'draft',
      ownerId: 'test-user',
      organizationId: args.wrongOrgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    results.door2Success = id2 as string

    // Test 4: Write via door3 (rawDb) — should succeed, NO trigger
    const id3 = await door3Db.insert('posts', {
      title: 'Door 3 Post',
      content: 'Written via rawDb (nothing)',
      status: 'draft',
      ownerId: 'test-user',
      organizationId: args.wrongOrgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    results.door3Success = id3 as string

    // Count trigger log entries
    const triggerLogs = await ctx.db.query('expTriggerLog').collect()
    results.triggerLogCount = String(triggerLogs.length)

    return results
  },
})

// ---- Test: Read via different doors ----
export const readViaThreeDoors = internalMutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const rules = buildRlsRules(args.organizationId as string)

    // Door 1: RLS-wrapped reads
    const rlsWrappedDb = wrapDatabaseReader(ctx, ctx.db, rules, { defaultPolicy: 'deny' })

    // Door 3: raw reads
    const rawDb = ctx.db

    const door1Posts = await rlsWrappedDb.query('posts').collect()
    const door3Posts = await rawDb.query('posts').collect()

    return {
      door1Count: door1Posts.length,
      door3Count: door3Posts.length,
      door1Titles: door1Posts.map((p) => p.title),
      door3Titles: door3Posts.map((p) => p.title),
    }
  },
})

// ---- Test: Verify two wrapDB calls don't interfere ----
export const testTwoWrapDbCalls = internalMutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const rules = buildRlsRules(args.organizationId as string)

    // Create both doors in the same mutation
    // Door 1: RLS(triggers(raw)) — same corrected composition
    const door1TriggerCtx = triggers.wrapDB(ctx)
    const door1Db = wrapDatabaseWriter(ctx, door1TriggerCtx.db, rules, { defaultPolicy: 'deny' })
    const door2Ctx = triggers.wrapDB({ ...ctx, db: ctx.db })

    // Write via door 1 (RLS + triggers)
    await door1Db.insert('posts', {
      title: 'Interference Test Door1',
      content: 'test',
      status: 'draft',
      ownerId: 'test',
      organizationId: args.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // Write via door 2 (triggers only, no RLS) — different org should work
    await door2Ctx.db.insert('posts', {
      title: 'Interference Test Door2',
      content: 'test',
      status: 'draft',
      ownerId: 'test',
      organizationId: args.organizationId, // same org just to keep it simple
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // Both should have triggered
    const logs = await ctx.db.query('expTriggerLog').collect()

    return {
      success: true,
      triggerLogCount: logs.length,
    }
  },
})

/**
 * Experiment 1: Wrapped Convex query/mutation builders
 *
 * Tests if wrapping query()/mutation() preserves valid function references.
 * The wrapper changes handler signature from (ctx, args) to (db, args, meta).
 */

import { v } from 'convex/values'
import type { ObjectType, PropertyValidators } from 'convex/values'
import type { GenericQueryCtx, GenericMutationCtx, GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'

import { query, mutation } from '../_generated/server'
import type { DataModel } from '../_generated/dataModel'

// ============================================
// Wrapper types
// ============================================

type ScopedMeta = {
  organizationId: string
  raw: { ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> }
}

type ScopedQueryHandler<Args> = (
  db: GenericDatabaseReader<DataModel>,
  args: Args,
  meta: ScopedMeta,
) => unknown | Promise<unknown>

type ScopedMutationHandler<Args> = (
  db: GenericDatabaseWriter<DataModel>,
  args: Args,
  meta: ScopedMeta,
) => unknown | Promise<unknown>

// ============================================
// wrappedQuery — wraps query() with custom handler signature
// ============================================

function wrappedQuery<ArgsValidator extends PropertyValidators>(config: {
  args: ArgsValidator
  handler: ScopedQueryHandler<ObjectType<ArgsValidator>>
}) {
  return query({
    args: {
      ...config.args,
      // Inject organizationId as a required arg for scoping
      _orgId: v.string(),
    },
    handler: async (ctx, args) => {
      const { _orgId, ...userArgs } = args
      const meta: ScopedMeta = {
        organizationId: _orgId,
        raw: { ctx },
      }
      return config.handler(ctx.db, userArgs, meta)
    },
  })
}

// ============================================
// wrappedMutation — wraps mutation() with custom handler signature
// ============================================

function wrappedMutation<ArgsValidator extends PropertyValidators>(config: {
  args: ArgsValidator
  handler: ScopedMutationHandler<ObjectType<ArgsValidator>>
}) {
  return mutation({
    args: {
      ...config.args,
      _orgId: v.string(),
    },
    handler: async (ctx, args) => {
      const { _orgId, ...userArgs } = args
      const meta: ScopedMeta = {
        organizationId: _orgId,
        raw: { ctx },
      }
      return config.handler(ctx.db, userArgs, meta)
    },
  })
}

// ============================================
// Exported wrapped functions — these are what Convex sees
// ============================================

/** A wrapped query that lists notes scoped by org */
export const listNotes = wrappedQuery({
  args: {},
  handler: async (db, _args, _meta) => {
    // Just read all notes — this proves the db reference works
    const notes = await db.query('notes').order('desc').take(10)
    return notes
  },
})

/** A wrapped mutation that creates a note */
export const createNote = wrappedMutation({
  args: {
    title: v.string(),
    content: v.string(),
  },
  handler: async (db, args, meta) => {
    const noteId = await db.insert('notes', {
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
      userId: meta.organizationId, // store orgId as userId for test purposes
    })
    return noteId
  },
})

/** A wrapped query that reads a single document by ID */
export const getNote = wrappedQuery({
  args: {
    id: v.id('notes'),
  },
  handler: async (db, args, _meta) => {
    return await db.get(args.id)
  },
})

/** A wrapped mutation that patches a document */
export const updateNote = wrappedMutation({
  args: {
    id: v.id('notes'),
    title: v.string(),
  },
  handler: async (db, args, _meta) => {
    await db.patch(args.id, { title: args.title })
  },
})

/** A wrapped mutation that deletes a document */
export const deleteNote = wrappedMutation({
  args: {
    id: v.id('notes'),
  },
  handler: async (db, args, _meta) => {
    await db.delete(args.id)
  },
})

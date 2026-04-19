import { wrapDatabaseReader } from 'convex-helpers/server/rowLevelSecurity'
import { Triggers } from 'convex-helpers/server/triggers'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import type { Id } from './_generated/dataModel'
/**
 * Experiment 8: Trellis-Owned Scope Proxy
 *
 * Tests whether Trellis can own its RLS layer using index-based scoping
 * instead of convex-helpers' post-fetch filtering. Compares three approaches:
 *
 * A) Auto-index: proxy.query() auto-applies .withIndex() for scope field
 * B) Compound-index: proxy intercepts .withIndex() and prepends scope
 * C) Post-fetch filter: same as convex-helpers (baseline comparison)
 *
 * Also tests: write enforcement, get() scope check, trigger auto-scoping,
 * non-scoped table passthrough.
 */
import { internalMutation, internalQuery } from './_generated/server'
import type { QueryCtx, MutationCtx, DatabaseReader, DatabaseWriter } from './_generated/server'

// ============================================================
// APPROACH A: Auto-Index Scope Proxy
// ============================================================
// Intercepts .query() on scoped tables and auto-applies .withIndex()
// using the scope field's index. Non-scoped tables pass through.

interface ScopeConfig {
  /** Field name that holds the scope value (e.g., 'organizationId') */
  scopeField: string
  /** Index name for the scope field (e.g., 'by_organization') */
  scopeIndex: string
  /** The scope value to filter by */
  scopeValue: string
  /** Compound indexes that start with the scope field */
  compoundIndexes?: string[]
}

/**
 * Creates a read proxy that auto-applies index-based scope filtering.
 * For scoped tables: .query() auto-applies .withIndex(scopeIndex)
 * For non-scoped tables: passes through to raw db
 */
function createScopedReader(
  db: DatabaseReader,
  scopedTables: Record<string, ScopeConfig>,
): DatabaseReader {
  return {
    ...db,
    query: (tableName: any) => {
      const config = scopedTables[tableName]
      if (!config) {
        // Non-scoped table: passthrough
        return db.query(tableName)
      }
      // Scoped table: auto-apply index
      return db
        .query(tableName)
        .withIndex(config.scopeIndex as any, (q: any) =>
          q.eq(config.scopeField, config.scopeValue),
        ) as any
    },
    get: async (idOrTable: any, maybeId?: any) => {
      // Handle both .get(id) and .get(table, id) signatures
      const doc = await (db as any).get(idOrTable, maybeId)
      if (!doc) return null

      // Check scope for all scoped tables
      for (const [_table, config] of Object.entries(scopedTables)) {
        if (config.scopeField in doc && (doc as any)[config.scopeField] !== config.scopeValue) {
          return null // Scope mismatch — treat as not found
        }
      }
      return doc
    },
    normalizeId: db.normalizeId.bind(db),
    system: db.system,
  } as DatabaseReader
}

/**
 * Creates a write proxy that enforces scope on all write operations.
 * Insert: verifies scope field matches.
 * Patch/Replace/Delete: fetches doc first, checks scope.
 */
function createScopedWriter(
  db: DatabaseWriter,
  scopedTables: Record<string, ScopeConfig>,
): DatabaseWriter {
  const reader = createScopedReader(db, scopedTables)

  return {
    ...reader,
    insert: async (table: any, doc: any) => {
      const config = scopedTables[table]
      if (config) {
        const docScopeValue = doc[config.scopeField]
        if (docScopeValue !== config.scopeValue) {
          throw new Error(
            `Scope violation on insert: ${config.scopeField} is "${docScopeValue}", expected "${config.scopeValue}"`,
          )
        }
      }
      return db.insert(table, doc)
    },
    patch: async (idOrTable: any, idOrValue: any, maybeValue?: any) => {
      // Resolve the actual id and value
      let id: any, value: any
      if (maybeValue !== undefined) {
        id = idOrValue
        value = maybeValue
      } else {
        id = idOrTable
        value = idOrValue
      }

      // Check existing doc is in scope
      const existing = await db.get(id)
      if (!existing) throw new Error('Document not found')

      for (const [_table, config] of Object.entries(scopedTables)) {
        if (
          config.scopeField in existing &&
          (existing as any)[config.scopeField] !== config.scopeValue
        ) {
          throw new Error(`Scope violation on patch: document belongs to different scope`)
        }
        // Prevent changing the scope field
        if (config.scopeField in value) {
          throw new Error(`Cannot change scope field "${config.scopeField}" via patch`)
        }
      }

      return (db as any).patch(idOrTable, idOrValue, maybeValue)
    },
    delete: async (idOrTable: any, maybeId?: any) => {
      const id = maybeId ?? idOrTable
      const existing = await db.get(id)
      if (!existing) throw new Error('Document not found')

      for (const [_table, config] of Object.entries(scopedTables)) {
        if (
          config.scopeField in existing &&
          (existing as any)[config.scopeField] !== config.scopeValue
        ) {
          throw new Error(`Scope violation on delete: document belongs to different scope`)
        }
      }

      return (db as any).delete(idOrTable, maybeId)
    },
    replace: async (idOrTable: any, idOrValue: any, maybeValue?: any) => {
      const id = maybeValue !== undefined ? idOrValue : idOrTable
      const existing = await db.get(id)
      if (!existing) throw new Error('Document not found')

      for (const [_table, config] of Object.entries(scopedTables)) {
        if (
          config.scopeField in existing &&
          (existing as any)[config.scopeField] !== config.scopeValue
        ) {
          throw new Error(`Scope violation on replace: document belongs to different scope`)
        }
      }

      return (db as any).replace(idOrTable, idOrValue, maybeValue)
    },
    system: db.system,
  } as DatabaseWriter
}

// ============================================================
// APPROACH B: Compound Index Proxy
// ============================================================
// Returns a ProxiedQueryInitializer that intercepts .withIndex()
// to prepend the scope field on compound indexes.

function createCompoundIndexReader(
  db: DatabaseReader,
  scopedTables: Record<string, ScopeConfig>,
): DatabaseReader {
  return {
    ...db,
    query: (tableName: any) => {
      const config = scopedTables[tableName]
      if (!config) return db.query(tableName)

      const realInitializer = db.query(tableName)

      // Return a proxy that intercepts .withIndex()
      return new Proxy(realInitializer, {
        get(target, prop) {
          if (prop === 'withIndex') {
            return (indexName: string, rangeCallback?: Function) => {
              const isCompound = config.compoundIndexes?.includes(indexName)

              if (isCompound) {
                // Prepend scope field to the range callback
                return (target as any).withIndex(indexName, (q: any) => {
                  const afterScope = q.eq(config.scopeField, config.scopeValue)
                  return rangeCallback ? rangeCallback(afterScope) : afterScope
                })
              } else if (indexName === config.scopeIndex) {
                // Direct scope index usage — auto-apply scope value
                return (target as any).withIndex(indexName, (q: any) =>
                  q.eq(config.scopeField, config.scopeValue),
                )
              } else {
                // Unknown index on scoped table — error
                throw new Error(
                  `Index "${indexName}" on scoped table "${tableName}" is not registered as a compound index. ` +
                    `Use a compound index starting with "${config.scopeField}" or the scope index "${config.scopeIndex}".`,
                )
              }
            }
          }

          // For terminal methods without .withIndex() — auto-apply scope
          if (
            prop === 'collect' ||
            prop === 'first' ||
            prop === 'unique' ||
            prop === 'take' ||
            prop === 'paginate' ||
            prop === 'order' ||
            prop === 'filter' ||
            prop === Symbol.asyncIterator
          ) {
            // Auto-apply scope index, then delegate to result
            const scoped = (target as any).withIndex(config.scopeIndex, (q: any) =>
              q.eq(config.scopeField, config.scopeValue),
            )
            return (scoped as any)[prop].bind(scoped)
          }

          return (target as any)[prop]
        },
      }) as any
    },
    get: async (idOrTable: any, maybeId?: any) => {
      const doc = await (db as any).get(idOrTable, maybeId)
      if (!doc) return null
      for (const [_table, config] of Object.entries(scopedTables)) {
        if (config.scopeField in doc && (doc as any)[config.scopeField] !== config.scopeValue) {
          return null
        }
      }
      return doc
    },
    normalizeId: db.normalizeId.bind(db),
    system: db.system,
  } as DatabaseReader
}

// ============================================================
// APPROACH D: Hybrid — Auto-Index + Native .filter() Fallback
// ============================================================
// Best of both worlds:
// - Simple queries (.query('posts').collect()): auto-apply scope index → efficient
// - User-indexed queries (.query('posts').withIndex('by_status')): let user keep
//   their index, add Convex native .filter() for scope → correct, no compound req
// - Compound indexes: if user uses one, prepend scope (optional optimization)

function createHybridReader(
  db: DatabaseReader,
  scopedTables: Record<string, ScopeConfig>,
): DatabaseReader {
  return {
    ...db,
    query: (tableName: any) => {
      const config = scopedTables[tableName]
      if (!config) return db.query(tableName)

      const realInitializer = db.query(tableName)

      // Return a proxy that intercepts method calls
      return new Proxy(realInitializer, {
        get(target, prop) {
          if (prop === 'withIndex') {
            return (indexName: string, rangeCallback?: Function) => {
              const isCompound = config.compoundIndexes?.includes(indexName)

              if (isCompound) {
                // Compound index: prepend scope (most efficient)
                return (target as any).withIndex(indexName, (q: any) => {
                  const afterScope = q.eq(config.scopeField, config.scopeValue)
                  return rangeCallback ? rangeCallback(afterScope) : afterScope
                })
              } else if (indexName === config.scopeIndex) {
                // Direct scope index usage
                return (target as any).withIndex(indexName, (q: any) =>
                  q.eq(config.scopeField, config.scopeValue),
                )
              } else {
                // User's own index — let them use it, add native .filter() for scope
                const indexed = rangeCallback
                  ? (target as any).withIndex(indexName, rangeCallback)
                  : (target as any).withIndex(indexName)
                return indexed.filter((q: any) =>
                  q.eq(q.field(config.scopeField), config.scopeValue),
                )
              }
            }
          }

          // For terminal methods without .withIndex() — auto-apply scope index
          if (
            prop === 'collect' ||
            prop === 'first' ||
            prop === 'unique' ||
            prop === 'take' ||
            prop === 'paginate' ||
            prop === 'order' ||
            prop === 'filter' ||
            prop === Symbol.asyncIterator
          ) {
            const scoped = (target as any).withIndex(config.scopeIndex, (q: any) =>
              q.eq(config.scopeField, config.scopeValue),
            )
            return (scoped as any)[prop].bind(scoped)
          }

          return (target as any)[prop]
        },
      }) as any
    },
    get: async (idOrTable: any, maybeId?: any) => {
      const doc = await (db as any).get(idOrTable, maybeId)
      if (!doc) return null
      for (const [_table, config] of Object.entries(scopedTables)) {
        if (config.scopeField in doc && (doc as any)[config.scopeField] !== config.scopeValue) {
          return null
        }
      }
      return doc
    },
    normalizeId: db.normalizeId.bind(db),
    system: db.system,
  } as DatabaseReader
}

// ============================================================
// APPROACH C: Post-Fetch Filter (convex-helpers baseline)
// ============================================================
// Uses convex-helpers wrapDatabaseReader for direct comparison.

function createFilteredReader(
  ctx: QueryCtx,
  db: DatabaseReader,
  scopedTables: Record<string, ScopeConfig>,
): DatabaseReader {
  const rules: Record<string, any> = {}
  for (const [table, config] of Object.entries(scopedTables)) {
    rules[table] = {
      read: async (_ctx: QueryCtx, doc: any) => {
        return doc[config.scopeField] === config.scopeValue
      },
    }
  }
  return wrapDatabaseReader(ctx, db, rules, {
    defaultPolicy: 'allow',
  })
}

// ============================================================
// SEED DATA
// ============================================================

export const seedScopeTest = internalMutation({
  args: {
    org1Id: v.id('organizations'),
    org2Id: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    // Create 20 posts: 10 per org, mix of statuses
    for (let i = 1; i <= 10; i++) {
      await ctx.db.insert('posts', {
        title: `Org1 Post ${i}`,
        content: `Content ${i}`,
        status: i <= 5 ? 'published' : 'draft',
        ownerId: 'user-1',
        organizationId: args.org1Id,
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i,
      })
    }
    for (let i = 1; i <= 10; i++) {
      await ctx.db.insert('posts', {
        title: `Org2 Post ${i}`,
        content: `Content ${i}`,
        status: i <= 5 ? 'published' : 'draft',
        ownerId: 'user-2',
        organizationId: args.org2Id,
        createdAt: Date.now() + 10 + i,
        updatedAt: Date.now() + 10 + i,
      })
    }
  },
})

// ============================================================
// TEST 8a: Index-based scope + pagination (full page sizes?)
// ============================================================

export const test8aPaginateAutoIndex = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    paginationOpts: v.any(),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
      },
    }
    const scopedDb = createScopedReader(ctx.db, scopedTables)
    return await scopedDb.query('posts').paginate(args.paginationOpts)
  },
})

export const test8aPaginateFilter = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    paginationOpts: v.any(),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
      },
    }
    const filteredDb = createFilteredReader(ctx, ctx.db, scopedTables)
    return await filteredDb.query('posts').paginate(args.paginationOpts)
  },
})

// ============================================================
// TEST 8b: Compound index with scope prepend
// ============================================================

export const test8bCompoundIndex = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
        compoundIndexes: ['by_org_status'],
      },
    }
    const scopedDb = createCompoundIndexReader(ctx.db, scopedTables)

    // User writes .withIndex('by_org_status', q => q.eq('status', ...))
    // Proxy prepends .eq('organizationId', scopeValue) automatically
    const posts = await scopedDb
      .query('posts')
      .withIndex('by_org_status' as any, (q: any) => q.eq('status', args.status))
      .collect()

    return {
      count: posts.length,
      titles: posts.map((p: any) => p.title),
      statuses: posts.map((p: any) => p.status),
    }
  },
})

// Test: what happens when user tries a non-compound index on scoped table
export const test8bBlockedIndex = internalQuery({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
        compoundIndexes: ['by_org_status'],
      },
    }
    const scopedDb = createCompoundIndexReader(ctx.db, scopedTables)

    try {
      // by_status is NOT a compound index — should be blocked
      await scopedDb
        .query('posts')
        .withIndex('by_status' as any, (q: any) => q.eq('status', 'published'))
        .collect()
      return { blocked: false, error: '' }
    } catch (e: any) {
      return { blocked: true, error: e.message }
    }
  },
})

// Test: compound proxy falls back to auto-index when no .withIndex() called
export const test8bAutoFallback = internalQuery({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
        compoundIndexes: ['by_org_status'],
      },
    }
    const scopedDb = createCompoundIndexReader(ctx.db, scopedTables)

    // No .withIndex() — should auto-apply scope index
    const posts = await scopedDb.query('posts').collect()
    return {
      count: posts.length,
      titles: posts.map((p: any) => p.title),
    }
  },
})

// ============================================================
// TEST 8c: Write enforcement
// ============================================================

export const test8cWriteEnforcement = internalMutation({
  args: {
    org1Id: v.id('organizations'),
    org2Id: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.org1Id as string,
      },
    }
    const scopedDb = createScopedWriter(ctx.db, scopedTables)
    const results: Record<string, string> = {}

    // Test 1: Insert with correct scope — should succeed
    try {
      const id = await scopedDb.insert('posts', {
        title: 'Scoped Insert Test',
        content: 'test',
        status: 'draft',
        ownerId: 'test',
        organizationId: args.org1Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      results.insertCorrect = id as string
    } catch (e: any) {
      results.insertCorrect = `ERROR: ${e.message}`
    }

    // Test 2: Insert with wrong scope — should fail
    try {
      await scopedDb.insert('posts', {
        title: 'Wrong Scope Insert',
        content: 'test',
        status: 'draft',
        ownerId: 'test',
        organizationId: args.org2Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      results.insertWrong = 'NO ERROR'
    } catch (e: any) {
      results.insertWrong = e.message
    }

    // Test 3: Patch own doc — should succeed
    if (!results.insertCorrect.startsWith('ERROR')) {
      try {
        await scopedDb.patch(results.insertCorrect as any, {
          title: 'Patched Title',
        })
        results.patchOwn = 'OK'
      } catch (e: any) {
        results.patchOwn = `ERROR: ${e.message}`
      }
    }

    // Test 4: Create a doc in org2 via raw db, try to patch via scoped db
    const foreignId = await ctx.db.insert('posts', {
      title: 'Foreign Post',
      content: 'test',
      status: 'draft',
      ownerId: 'test',
      organizationId: args.org2Id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    try {
      await scopedDb.patch(foreignId, { title: 'Hacked' })
      results.patchForeign = 'NO ERROR'
    } catch (e: any) {
      results.patchForeign = e.message
    }

    // Test 5: Delete own doc — should succeed
    if (!results.insertCorrect.startsWith('ERROR')) {
      try {
        await scopedDb.delete(results.insertCorrect as any)
        results.deleteOwn = 'OK'
      } catch (e: any) {
        results.deleteOwn = `ERROR: ${e.message}`
      }
    }

    // Test 6: Delete foreign doc — should fail
    try {
      await scopedDb.delete(foreignId)
      results.deleteForeign = 'NO ERROR'
    } catch (e: any) {
      results.deleteForeign = e.message
    }

    // Test 7: get() on foreign doc returns null
    const scopedReader = createScopedReader(ctx.db, scopedTables)
    const foreignDoc = await scopedReader.get(foreignId)
    results.getForeign = foreignDoc === null ? 'null (correct)' : 'LEAKED'

    // Cleanup
    await ctx.db.delete(foreignId)

    return results
  },
})

// ============================================================
// TEST 8d: Trigger auto-scoping from document
// ============================================================

const triggers = new Triggers<DataModel>()

// Register a trigger that attempts to write via a scoped proxy
// built from the triggering document's scope value
triggers.register('posts', async (ctx, change) => {
  const doc = change.newDoc ?? change.oldDoc
  if (!doc) return
  if (change.operation !== 'insert') return

  // Read the scope value from the triggering document
  const scopeValue = doc.organizationId as string

  // Build a scoped writer from the trigger's raw innerDb
  const scopedTables = {
    posts: {
      scopeField: 'organizationId',
      scopeIndex: 'by_organization',
      scopeValue,
    },
  }
  const scopedInnerDb = createScopedReader(ctx.innerDb, scopedTables)

  // Count posts visible through scoped proxy (should only see same-org posts)
  const visiblePosts = await scopedInnerDb.query('posts').collect()

  // Write to expTriggerLog using raw innerDb (audit — unscoped)
  await ctx.innerDb.insert('expTriggerLog', {
    table: 'posts',
    operation: 'scope-test',
    docId: doc._id as string,
    door: `scoped:${visiblePosts.length}`,
    timestamp: Date.now(),
  })
})

export const test8dTriggerScoping = internalMutation({
  args: {
    org1Id: v.id('organizations'),
    org2Id: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    // Clear trigger logs
    const existingLogs = await ctx.db.query('expTriggerLog').collect()
    for (const log of existingLogs) {
      await ctx.db.delete(log._id)
    }

    // Seed some posts in org2 first (so they exist before trigger fires)
    for (let i = 1; i <= 3; i++) {
      await ctx.db.insert('posts', {
        title: `Pre-existing Org2 Post ${i}`,
        content: 'test',
        status: 'published',
        ownerId: 'user-2',
        organizationId: args.org2Id,
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i,
      })
    }

    // Insert a post via trigger-wrapped db in org1
    // The trigger should auto-scope to org1, NOT see org2 posts
    const wrappedCtx = triggers.wrapDB(ctx)
    await wrappedCtx.db.insert('posts', {
      title: 'Trigger Test Post Org1',
      content: 'test',
      status: 'published',
      ownerId: 'user-1',
      organizationId: args.org1Id,
      createdAt: Date.now() + 100,
      updatedAt: Date.now() + 100,
    })

    // Insert a post in org2 via trigger-wrapped db
    await wrappedCtx.db.insert('posts', {
      title: 'Trigger Test Post Org2',
      content: 'test',
      status: 'published',
      ownerId: 'user-2',
      organizationId: args.org2Id,
      createdAt: Date.now() + 200,
      updatedAt: Date.now() + 200,
    })

    // Read trigger logs
    const logs = await ctx.db.query('expTriggerLog').collect()
    const scopeLogs = logs.filter((l) => l.operation === 'scope-test')

    return {
      triggerCount: scopeLogs.length,
      triggers: scopeLogs.map((l) => ({
        docId: l.docId,
        door: l.door,
      })),
    }
  },
})

// ============================================================
// TEST 8e: Non-scoped table passthrough
// ============================================================

export const test8eNonScoped = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Scope config only has 'posts' — 'notes' should pass through
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: 'some-org-id',
      },
    }
    const scopedDb = createScopedWriter(ctx.db, scopedTables)

    // Insert into non-scoped table — should work fine
    const noteId = await scopedDb.insert('notes', {
      title: 'Unscoped Note',
      content: 'This should pass through',
      createdAt: Date.now(),
    })

    // Read back
    const note = await scopedDb.get(noteId)

    // Query non-scoped table
    const notes = await scopedDb.query('notes').collect()

    // Cleanup
    await ctx.db.delete(noteId)

    return {
      insertWorked: !!noteId,
      getWorked: !!note && note.title === 'Unscoped Note',
      queryWorked: notes.length > 0,
    }
  },
})

// ============================================================
// TEST 8f: Hybrid approach — user index + native .filter()
// ============================================================

// 8f-1: User uses their own index (by_status), proxy adds .filter() for scope
export const test8fUserIndex = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
        compoundIndexes: ['by_org_status'],
      },
    }
    const hybridDb = createHybridReader(ctx.db, scopedTables)

    // User writes .withIndex('by_status') — NOT a compound index
    // Hybrid proxy: uses by_status index + adds native .filter() for scope
    const posts = await hybridDb
      .query('posts')
      .withIndex('by_status' as any, (q: any) => q.eq('status', args.status))
      .collect()

    return {
      count: posts.length,
      titles: posts.map((p: any) => p.title),
      orgs: posts.map((p: any) => p.organizationId),
    }
  },
})

// 8f-2: Hybrid with compound index — should still prepend (optimization path)
export const test8fCompoundOptimization = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
        compoundIndexes: ['by_org_status'],
      },
    }
    const hybridDb = createHybridReader(ctx.db, scopedTables)

    // User uses compound index — proxy prepends scope (most efficient path)
    const posts = await hybridDb
      .query('posts')
      .withIndex('by_org_status' as any, (q: any) => q.eq('status', args.status))
      .collect()

    return {
      count: posts.length,
      titles: posts.map((p: any) => p.title),
    }
  },
})

// 8f-3: Hybrid pagination with user index + .filter() — do we get full pages?
export const test8fPaginateWithUserIndex = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    paginationOpts: v.any(),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
      },
    }
    const hybridDb = createHybridReader(ctx.db, scopedTables)

    // Paginate using by_status index with .filter() scope enforcement
    return await hybridDb
      .query('posts')
      .withIndex('by_status' as any, (q: any) => q.eq('status', 'published'))
      .paginate(args.paginationOpts)
  },
})

// 8f-4: Simple query (no .withIndex) — should auto-apply scope index
export const test8fSimpleQuery = internalQuery({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const scopedTables = {
      posts: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.organizationId as string,
      },
    }
    const hybridDb = createHybridReader(ctx.db, scopedTables)

    // No .withIndex() — auto-applies scope index
    const posts = await hybridDb.query('posts').collect()

    return {
      count: posts.length,
      titles: posts.map((p: any) => p.title),
    }
  },
})

import { v } from 'convex/values'

/**
 * Experiment 9: Auto-Compound Indexes + Transparent Index Mapping
 *
 * Tests whether Trellis can:
 * 1. Auto-compound user-defined indexes with the scope field
 * 2. Transparently map user .withIndex() calls to compound versions
 * 3. User never writes, sees, or thinks about compound indexes
 *
 * The flow:
 * - User writes: .index('by_status', ['status'])
 * - trellisTable stores: .index('by_status', ['organizationId', 'status'])
 * - User queries: .withIndex('by_status', q => q.eq('status', 'published'))
 * - Proxy maps to: .withIndex('by_status', q => q.eq('organizationId', scopeVal).eq('status', 'published'))
 *
 * Since we can't dynamically create schema in convex-test, we use the
 * existing schema where posts already has:
 *   .index('by_org_status', ['organizationId', 'status'])
 *   .index('by_organization', ['organizationId'])
 *
 * We simulate the mapping: user thinks 'by_status' → proxy maps to 'by_org_status'
 */
import { internalMutation, internalQuery } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'

// ============================================================
// trellisTable() — schema helper (tested as pure function)
// ============================================================

/**
 * Simulates what trellisTable() would do at schema definition time.
 * Takes user-defined indexes and returns the compound versions.
 *
 * In production, this would wrap defineTable() and intercept .index() calls.
 * Here we test the logic in isolation.
 */
interface IndexDef {
  name: string
  fields: string[]
}

interface ScopeTableConfig {
  scopeField: string
  userIndexes: IndexDef[]
}

function autoCompoundIndexes(config: ScopeTableConfig): {
  /** The actual compound indexes to register with Convex */
  compoundIndexes: IndexDef[]
  /** Map from user-facing name → actual index name */
  indexMap: Record<string, string>
  /** The scope-only index (auto-added) */
  scopeIndex: IndexDef
} {
  const compoundIndexes: IndexDef[] = []
  const indexMap: Record<string, string> = {}

  // Auto-add the scope-only index
  const scopeIndexName = `by_${config.scopeField}`
  const scopeIndex: IndexDef = {
    name: scopeIndexName,
    fields: [config.scopeField],
  }
  compoundIndexes.push(scopeIndex)

  for (const userIdx of config.userIndexes) {
    // Check if user's index already starts with scope field
    if (userIdx.fields[0] === config.scopeField) {
      // Already compound — use as-is
      compoundIndexes.push(userIdx)
      indexMap[userIdx.name] = userIdx.name
    } else {
      // Auto-compound: prepend scope field
      const compoundIdx: IndexDef = {
        name: userIdx.name, // Keep user's name!
        fields: [config.scopeField, ...userIdx.fields],
      }
      compoundIndexes.push(compoundIdx)
      indexMap[userIdx.name] = userIdx.name
    }
  }

  return { compoundIndexes, indexMap, scopeIndex }
}

// ============================================================
// Auto-mapping scope proxy
// ============================================================

interface AutoScopeConfig {
  scopeField: string
  scopeValue: string
  /** Index name for scope-only queries (auto-generated) */
  scopeIndex: string
  /** All user-facing index names (all are auto-compounded) */
  userIndexes: string[]
}

/**
 * Creates a db reader where:
 * - .query('table').collect() → auto-applies scope index
 * - .query('table').withIndex('by_status', q => q.eq('status', 'published'))
 *   → maps to compound index, prepends scope field
 * - User never knows about compound indexes
 */
function createAutoScopedReader(
  db: DatabaseReader,
  scopedTables: Record<string, AutoScopeConfig>,
): DatabaseReader {
  return {
    ...db,
    query: (tableName: any) => {
      const config = scopedTables[tableName]
      if (!config) return db.query(tableName)

      const realInitializer = db.query(tableName)

      return new Proxy(realInitializer, {
        get(target, prop) {
          if (prop === 'withIndex') {
            return (indexName: string, userRangeCallback?: Function) => {
              if (indexName === config.scopeIndex) {
                // Direct scope index — just apply scope
                return (target as any).withIndex(indexName, (q: any) =>
                  q.eq(config.scopeField, config.scopeValue),
                )
              }

              if (config.userIndexes.includes(indexName)) {
                // User's index — it's been auto-compounded, prepend scope
                return (target as any).withIndex(indexName, (q: any) => {
                  const afterScope = q.eq(config.scopeField, config.scopeValue)
                  return userRangeCallback ? userRangeCallback(afterScope) : afterScope
                })
              }

              // Unknown index — error
              throw new Error(
                `Unknown index "${indexName}" on scoped table "${tableName}". ` +
                  `Available indexes: ${[config.scopeIndex, ...config.userIndexes].join(', ')}`,
              )
            }
          }

          // Terminal/chain methods without .withIndex() → auto-apply scope
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

/**
 * Creates a db writer with scope enforcement on all operations.
 */
function createAutoScopedWriter(
  db: DatabaseWriter,
  scopedTables: Record<string, AutoScopeConfig>,
): DatabaseWriter {
  const reader = createAutoScopedReader(db, scopedTables)

  return {
    ...reader,
    insert: async (table: any, doc: any) => {
      const config = scopedTables[table]
      if (config && doc[config.scopeField] !== config.scopeValue) {
        throw new Error(
          `Scope violation on insert: ${config.scopeField} is "${doc[config.scopeField]}", expected "${config.scopeValue}"`,
        )
      }
      return db.insert(table, doc)
    },
    patch: async (id: any, value: any) => {
      const existing = await db.get(id)
      if (!existing) throw new Error('Document not found')
      for (const [_table, config] of Object.entries(scopedTables)) {
        if (
          config.scopeField in existing &&
          (existing as any)[config.scopeField] !== config.scopeValue
        ) {
          throw new Error('Scope violation on patch: document belongs to different scope')
        }
        if (config.scopeField in value) {
          throw new Error(`Cannot change scope field "${config.scopeField}" via patch`)
        }
      }
      return db.patch(id, value)
    },
    delete: async (id: any) => {
      const existing = await db.get(id)
      if (!existing) throw new Error('Document not found')
      for (const [_table, config] of Object.entries(scopedTables)) {
        if (
          config.scopeField in existing &&
          (existing as any)[config.scopeField] !== config.scopeValue
        ) {
          throw new Error('Scope violation on delete: document belongs to different scope')
        }
      }
      return db.delete(id)
    },
    replace: async (id: any, value: any) => {
      const existing = await db.get(id)
      if (!existing) throw new Error('Document not found')
      for (const [_table, config] of Object.entries(scopedTables)) {
        if (
          config.scopeField in existing &&
          (existing as any)[config.scopeField] !== config.scopeValue
        ) {
          throw new Error('Scope violation on replace: document belongs to different scope')
        }
      }
      return db.replace(id, value)
    },
    system: db.system,
  } as DatabaseWriter
}

// ============================================================
// EXPORTED HELPER: autoCompoundIndexes (for unit test)
// ============================================================

export { autoCompoundIndexes, type ScopeTableConfig, type IndexDef }

// ============================================================
// SEED
// ============================================================

export const seedAutoCompound = internalMutation({
  args: {
    org1Id: v.id('organizations'),
    org2Id: v.id('organizations'),
  },
  handler: async (ctx, args) => {
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
// TEST FUNCTIONS
// ============================================================

// Helper: build the auto-scope config for posts.
// In production, trellisTable() would generate this from schema metadata.
// Here we simulate: user defined .index('by_status', ['status'])
// but the actual schema has .index('by_org_status', ['organizationId', 'status']).
//
// KEY INSIGHT: In production, trellisTable keeps the user's index NAME
// but stores compound fields. So the actual Convex index IS named 'by_status'
// but its fields are ['organizationId', 'status'].
//
// For this experiment, we use the existing schema where the compound index
// is named 'by_org_status'. The proxy maps 'by_status' → 'by_org_status'.
// In production with trellisTable, both names would be the same.

function buildPostsScopeConfig(orgId: string) {
  return {
    posts: {
      scopeField: 'organizationId',
      scopeValue: orgId,
      scopeIndex: 'by_organization',
      userIndexes: ['by_org_status'], // In production: would be 'by_status'
    } satisfies AutoScopeConfig,
  }
}

// 9a: User queries with their "index" — proxy prepends scope transparently
export const test9aTransparentIndex = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const config = buildPostsScopeConfig(args.organizationId as string)
    const scopedDb = createAutoScopedReader(ctx.db, config)

    // User writes: .withIndex('by_org_status', q => q.eq('status', 'published'))
    // In production with trellisTable: .withIndex('by_status', q => q.eq('status', 'published'))
    // Proxy prepends: q => q.eq('organizationId', scopeVal).eq('status', 'published')
    const posts = await scopedDb
      .query('posts')
      .withIndex('by_org_status' as any, (q: any) => q.eq('status', args.status))
      .collect()

    return {
      count: posts.length,
      titles: posts.map((p: any) => p.title),
      allCorrectOrg: posts.every((p: any) => p.organizationId === (args.organizationId as string)),
      allCorrectStatus: posts.every((p: any) => p.status === args.status),
    }
  },
})

// 9b: Simple query — auto-scopes via scope index
export const test9bSimpleQuery = internalQuery({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const config = buildPostsScopeConfig(args.organizationId as string)
    const scopedDb = createAutoScopedReader(ctx.db, config)

    const posts = await scopedDb.query('posts').collect()

    return {
      count: posts.length,
      allCorrectOrg: posts.every((p: any) => p.organizationId === (args.organizationId as string)),
    }
  },
})

// 9c: Pagination with transparent compound index
export const test9cPaginate = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    paginationOpts: v.any(),
  },
  handler: async (ctx, args) => {
    const config = buildPostsScopeConfig(args.organizationId as string)
    const scopedDb = createAutoScopedReader(ctx.db, config)

    // Paginate using the "user's" index — proxy handles compound mapping
    return await scopedDb
      .query('posts')
      .withIndex('by_org_status' as any, (q: any) => q.eq('status', 'published'))
      .paginate(args.paginationOpts)
  },
})

// 9d: Write enforcement through auto-scoped writer
export const test9dWrites = internalMutation({
  args: {
    org1Id: v.id('organizations'),
    org2Id: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const config = buildPostsScopeConfig(args.org1Id as string)
    const scopedDb = createAutoScopedWriter(ctx.db, config)
    const results: Record<string, string> = {}

    // Insert correct scope
    try {
      const id = await scopedDb.insert('posts', {
        title: 'Auto-Scoped Insert',
        content: 'test',
        status: 'draft',
        ownerId: 'test',
        organizationId: args.org1Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      results.insertCorrect = 'OK'

      // Patch it
      await scopedDb.patch(id, { title: 'Updated' })
      results.patchOwn = 'OK'

      // Delete it
      await scopedDb.delete(id)
      results.deleteOwn = 'OK'
    } catch (e: any) {
      results.insertCorrect = `ERROR: ${e.message}`
    }

    // Insert wrong scope
    try {
      await scopedDb.insert('posts', {
        title: 'Wrong Scope',
        content: 'test',
        status: 'draft',
        ownerId: 'test',
        organizationId: args.org2Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      results.insertWrong = 'NO ERROR'
    } catch (e: any) {
      results.insertWrong = 'BLOCKED'
    }

    // Cross-scope patch
    const foreignId = await ctx.db.insert('posts', {
      title: 'Foreign',
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
      results.patchForeign = 'BLOCKED'
    }

    // Cross-scope get
    const scopedReader = createAutoScopedReader(ctx.db, config)
    const doc = await scopedReader.get(foreignId)
    results.getForeign = doc === null ? 'HIDDEN' : 'LEAKED'

    // Cleanup
    await ctx.db.delete(foreignId)

    return results
  },
})

// 9e: Unknown index throws helpful error
export const test9eUnknownIndex = internalQuery({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const config = buildPostsScopeConfig(args.organizationId as string)
    const scopedDb = createAutoScopedReader(ctx.db, config)

    try {
      await scopedDb
        .query('posts')
        .withIndex('by_nonexistent' as any)
        .collect()
      return { error: '' }
    } catch (e: any) {
      return { error: e.message }
    }
  },
})

// 9f: Non-scoped table passes through
export const test9fNonScoped = internalMutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const config = buildPostsScopeConfig(args.organizationId as string)
    const scopedDb = createAutoScopedWriter(ctx.db, config)

    // notes is not in scope config — should pass through
    const noteId = await scopedDb.insert('notes', {
      content: 'Unscoped note',
      createdAt: Date.now(),
    })
    const note = await scopedDb.get(noteId)
    const notes = await scopedDb.query('notes').collect()

    await ctx.db.delete(noteId)

    return {
      insertOk: !!noteId,
      getOk: !!note,
      queryOk: notes.length > 0,
    }
  },
})

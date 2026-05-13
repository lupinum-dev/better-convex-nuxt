import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
/**
 * Experiment 13: Per-table scope config
 *
 * Validates that a single tenant-rules config can scope different tables
 * by different fields — the "hierarchical tenancy" use case.
 *
 * In this experiment:
 *   expWorkspaces  →  scoped by organizationId  (parent scope)
 *   expDocuments   →  scoped by workspaceId     (child scope)
 *
 * Core claims:
 *   13a  Proxy correctly dispatches per-table: workspaces scope by org,
 *        documents scope by workspace.
 *   13b  `.withIndex()` rewriting uses each table's own scope field.
 *   13c  Insert/patch/delete checks use each table's own scope field.
 *   13d  Non-compound index on a scoped table throws with the right
 *        message per table.
 *   13e  An appIdentity can see documents from workspace A without seeing
 *        documents from workspace B, even within the same org.
 */
import { internalMutation, internalQuery } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'

// ============================================================
// Per-table scope proxy
// ============================================================

/**
 * Per-table scope configuration. The user provides one entry per scoped
 * table. Tables not listed are pass-through.
 */
interface TableScope {
  scopeField: string
  scopeIndex: string // defaults to `by_<scopeField>`
  scopeValue: string
  /** Compound indexes that start with this table's scope field. */
  compoundIndexes: string[]
}

type ScopeMap = Record<string, TableScope>

function createReadProxy(db: DatabaseReader, scopes: ScopeMap): DatabaseReader {
  return {
    ...db,
    query: (tableName: any) => {
      const cfg = scopes[tableName]
      if (!cfg) return db.query(tableName)

      const base = db.query(tableName)
      return {
        ...base,
        withIndex: (indexName: string, cb?: (q: any) => any) => {
          // The scope-only index is always allowed.
          if (indexName === cfg.scopeIndex) {
            return base.withIndex(indexName as any, (q: any) => {
              const scoped = q.eq(cfg.scopeField, cfg.scopeValue)
              return cb ? cb(scoped) : scoped
            }) as any
          }
          // Compound indexes must start with this table's scope field.
          if (!cfg.compoundIndexes.includes(indexName)) {
            throw new Error(
              `Index '${indexName}' on scoped table '${tableName}' must ` +
                `start with scope field '${cfg.scopeField}'. Register it ` +
                `as a compound index or use '${cfg.scopeIndex}'.`,
            )
          }
          return base.withIndex(indexName as any, (q: any) => {
            const scoped = q.eq(cfg.scopeField, cfg.scopeValue)
            return cb ? cb(scoped) : scoped
          }) as any
        },
        collect: async () => {
          // Bare .collect() → auto-apply scope index.
          const rows = await base
            .withIndex(cfg.scopeIndex as any, (q: any) => q.eq(cfg.scopeField, cfg.scopeValue))
            .collect()
          return rows
        },
      } as any
    },
    get: async (id: any) => {
      const doc = await (db as any).get(id)
      if (!doc) return null
      // Per-table: check against its own scope field.
      for (const cfg of Object.values(scopes)) {
        if (cfg.scopeField in doc && doc[cfg.scopeField] !== cfg.scopeValue) {
          return null
        }
      }
      return doc
    },
  } as DatabaseReader
}

function createWriteProxy(db: DatabaseWriter, scopes: ScopeMap): DatabaseWriter {
  const readProxy = createReadProxy(db as any, scopes)
  return {
    ...(db as any),
    ...readProxy,
    insert: async (tableName: any, doc: any) => {
      const cfg = scopes[tableName]
      if (cfg) {
        const docScope = doc[cfg.scopeField]
        if (docScope !== cfg.scopeValue) {
          throw new Error(
            `Scope violation on insert into '${tableName}': ` +
              `doc.${cfg.scopeField} = ${docScope}, expected ${cfg.scopeValue}`,
          )
        }
      }
      return await db.insert(tableName, doc)
    },
    patch: async (id: any, patch: any) => {
      const existing = await (db as any).get(id)
      if (!existing) throw new Error('patch: document not found')
      for (const cfg of Object.values(scopes)) {
        if (cfg.scopeField in existing && existing[cfg.scopeField] !== cfg.scopeValue) {
          throw new Error(
            `Scope violation on patch: existing.${cfg.scopeField} = ` +
              `${existing[cfg.scopeField]}, expected ${cfg.scopeValue}`,
          )
        }
      }
      return await db.patch(id, patch)
    },
    delete: async (id: any) => {
      const existing = await (db as any).get(id)
      if (!existing) throw new Error('delete: document not found')
      for (const cfg of Object.values(scopes)) {
        if (cfg.scopeField in existing && existing[cfg.scopeField] !== cfg.scopeValue) {
          throw new Error(
            `Scope violation on delete: existing.${cfg.scopeField} = ` +
              `${existing[cfg.scopeField]}, expected ${cfg.scopeValue}`,
          )
        }
      }
      return await db.delete(id)
    },
  } as DatabaseWriter
}

// ============================================================
// Seed helpers
// ============================================================

export const seed = internalMutation({
  args: {
    org1Id: v.id('organizations'),
    org2Id: v.id('organizations'),
  },
  returns: v.object({
    ws1A: v.id('expWorkspaces'),
    ws1B: v.id('expWorkspaces'),
    ws2A: v.id('expWorkspaces'),
    doc1A: v.id('expDocuments'),
    doc1B: v.id('expDocuments'),
    doc2A: v.id('expDocuments'),
  }),
  handler: async (ctx, args) => {
    const ws1A = await ctx.db.insert('expWorkspaces', {
      name: 'Org1-WS-A',
      organizationId: args.org1Id,
      createdAt: Date.now(),
    })
    const ws1B = await ctx.db.insert('expWorkspaces', {
      name: 'Org1-WS-B',
      organizationId: args.org1Id,
      createdAt: Date.now(),
    })
    const ws2A = await ctx.db.insert('expWorkspaces', {
      name: 'Org2-WS-A',
      organizationId: args.org2Id,
      createdAt: Date.now(),
    })
    const doc1A = await ctx.db.insert('expDocuments', {
      title: 'Doc in WS-1A',
      status: 'draft',
      workspaceId: ws1A,
      createdAt: Date.now(),
    })
    const doc1B = await ctx.db.insert('expDocuments', {
      title: 'Doc in WS-1B',
      status: 'published',
      workspaceId: ws1B,
      createdAt: Date.now(),
    })
    const doc2A = await ctx.db.insert('expDocuments', {
      title: 'Doc in WS-2A',
      status: 'draft',
      workspaceId: ws2A,
      createdAt: Date.now(),
    })
    return { ws1A, ws1B, ws2A, doc1A, doc1B, doc2A }
  },
})

// ============================================================
// 13a: Proxy dispatches per-table
// ============================================================

export const readWorkspacesAndDocs = internalQuery({
  args: {
    orgId: v.id('organizations'),
    workspaceId: v.id('expWorkspaces'),
  },
  returns: v.object({
    workspacesInOrg: v.number(),
    documentsInWorkspace: v.number(),
  }),
  handler: async (ctx, args) => {
    const scopes: ScopeMap = {
      expWorkspaces: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.orgId,
        compoundIndexes: ['by_org_name'],
      },
      expDocuments: {
        scopeField: 'workspaceId',
        scopeIndex: 'by_workspace',
        scopeValue: args.workspaceId,
        compoundIndexes: ['by_workspace_status'],
      },
    }
    const db = createReadProxy(ctx.db, scopes)

    const workspacesInOrg = await db.query('expWorkspaces').collect()
    const documentsInWorkspace = await db.query('expDocuments').collect()
    return {
      workspacesInOrg: workspacesInOrg.length,
      documentsInWorkspace: documentsInWorkspace.length,
    }
  },
})

// ============================================================
// 13b: .withIndex rewriting uses each table's scope field
// ============================================================

export const readDocsByStatus = internalQuery({
  args: {
    workspaceId: v.id('expWorkspaces'),
    status: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const scopes: ScopeMap = {
      expDocuments: {
        scopeField: 'workspaceId',
        scopeIndex: 'by_workspace',
        scopeValue: args.workspaceId,
        compoundIndexes: ['by_workspace_status'],
      },
    }
    const db = createReadProxy(ctx.db, scopes)
    const docs = await db
      .query('expDocuments')
      .withIndex('by_workspace_status', (q: any) => q.eq('status', args.status))
      .collect()
    return docs.length
  },
})

// ============================================================
// 13c: Write enforcement per table
// ============================================================

export const tryWrongScopeInsert = internalMutation({
  args: {
    actorOrgId: v.id('organizations'),
    appIdentityWorkspaceId: v.id('expWorkspaces'),
    wrongOrgId: v.id('organizations'),
    wrongWorkspaceId: v.id('expWorkspaces'),
  },
  returns: v.object({
    workspaceInsertRejected: v.boolean(),
    documentInsertRejected: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const scopes: ScopeMap = {
      expWorkspaces: {
        scopeField: 'organizationId',
        scopeIndex: 'by_organization',
        scopeValue: args.actorOrgId,
        compoundIndexes: ['by_org_name'],
      },
      expDocuments: {
        scopeField: 'workspaceId',
        scopeIndex: 'by_workspace',
        scopeValue: args.appIdentityWorkspaceId,
        compoundIndexes: ['by_workspace_status'],
      },
    }
    const db = createWriteProxy(ctx.db, scopes)

    let workspaceInsertRejected = false
    try {
      await db.insert('expWorkspaces', {
        name: 'foreign',
        organizationId: args.wrongOrgId, // wrong scope
        createdAt: Date.now(),
      })
    } catch {
      workspaceInsertRejected = true
    }

    let documentInsertRejected = false
    try {
      await db.insert('expDocuments', {
        title: 'foreign',
        status: 'draft',
        workspaceId: args.wrongWorkspaceId, // wrong scope
        createdAt: Date.now(),
      })
    } catch {
      documentInsertRejected = true
    }

    return { workspaceInsertRejected, documentInsertRejected }
  },
})

// ============================================================
// 13d: Non-compound index rejection per table
// ============================================================

export const tryNonCompoundIndex = internalQuery({
  args: {
    workspaceId: v.id('expWorkspaces'),
  },
  returns: v.object({ rejected: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const scopes: ScopeMap = {
      expDocuments: {
        scopeField: 'workspaceId',
        scopeIndex: 'by_workspace',
        scopeValue: args.workspaceId,
        compoundIndexes: ['by_workspace_status'],
      },
    }
    const db = createReadProxy(ctx.db, scopes)
    try {
      // 'by_status' is NOT in compoundIndexes for this table.
      await db
        .query('expDocuments')
        // @ts-expect-error — intentionally passing an unregistered index
        .withIndex('by_status', (q: any) => q.eq('status', 'draft'))
        .collect()
      return { rejected: false, message: '' }
    } catch (err) {
      return { rejected: true, message: (err as Error).message }
    }
  },
})

// ============================================================
// 13e: Different workspaces see different documents (same org)
// ============================================================

export const compareWorkspaceIsolation = internalQuery({
  args: {
    wsA: v.id('expWorkspaces'),
    wsB: v.id('expWorkspaces'),
  },
  returns: v.object({ docsInA: v.number(), docsInB: v.number() }),
  handler: async (ctx, args) => {
    const makeDb = (wsId: Id<'expWorkspaces'>) => {
      const scopes: ScopeMap = {
        expDocuments: {
          scopeField: 'workspaceId',
          scopeIndex: 'by_workspace',
          scopeValue: wsId,
          compoundIndexes: ['by_workspace_status'],
        },
      }
      return createReadProxy(ctx.db, scopes)
    }
    const docsInA = await makeDb(args.wsA).query('expDocuments').collect()
    const docsInB = await makeDb(args.wsB).query('expDocuments').collect()
    return { docsInA: docsInA.length, docsInB: docsInB.length }
  },
})

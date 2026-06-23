import { ConvexError } from 'convex/values'

import type { TableNames } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'

const EXPERIMENT_RESET_ENV = 'ALLOW_TEST_RESET'
const appTables = ['auditEvents', 'projects', 'users'] as const satisfies readonly TableNames[]

function requireExperimentResetEnabled() {
  if (process.env[EXPERIMENT_RESET_ENV] !== 'true') {
    throw new ConvexError(`${EXPERIMENT_RESET_ENV}=true is required for experiment mutations`)
  }
}

async function deleteAllFromTable<Table extends TableNames>(ctx: MutationCtx, table: Table) {
  let deleted = 0

  for (;;) {
    const docs = await ctx.db.query(table).take(100)
    if (docs.length === 0) {
      return deleted
    }

    for (const doc of docs) {
      await ctx.db.delete(doc._id)
      deleted += 1
    }
  }
}

async function countTable<Table extends TableNames>(
  ctx: { db: { query: MutationCtx['db']['query'] } },
  table: Table,
) {
  let count = 0

  for (;;) {
    const docs = await ctx.db.query(table).take(100)
    count += docs.length
    if (docs.length < 100) {
      return count
    }
  }
}

async function getTableCounts(ctx: { db: { query: MutationCtx['db']['query'] } }) {
  const counts: Record<(typeof appTables)[number], number> = {
    auditEvents: 0,
    projects: 0,
    users: 0,
  }

  for (const table of appTables) {
    counts[table] = await countTable(ctx, table)
  }

  return counts
}

export const resetForExperiment = mutation({
  args: {},
  handler: async (ctx) => {
    requireExperimentResetEnabled()

    const deleted: Record<(typeof appTables)[number], number> = {
      auditEvents: 0,
      projects: 0,
      users: 0,
    }

    for (const table of appTables) {
      deleted[table] = await deleteAllFromTable(ctx, table)
    }

    return {
      ok: true,
      deleted,
      counts: await getTableCounts(ctx),
    }
  },
})

export const verify = query({
  args: {},
  handler: async (ctx) => {
    const counts = await getTableCounts(ctx)
    return {
      ok: counts.auditEvents === 0 && counts.projects === 0 && counts.users === 0,
      counts,
    }
  },
})

/**
 * MCP Tool: Bulk Delete Notes (Level 4 — full feature stack)
 *
 * Demonstrates:
 * - maxItems — caps array at 10 items
 * - middleware — audit logging before execution
 * - tags — for tool filtering/categorization
 * - destructive + preview — shows what will be deleted
 * - auth + permissions — requires post.delete permission
 * - rateLimit — 5 bulk deletes per minute
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation, serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { bulkDeleteNotesArgs, bulkDeleteNotesMeta } from '../../../shared/schemas/note'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(bulkDeleteNotesArgs, bulkDeleteNotesMeta)

export default defineConvexTool({
  schema,
  name: 'bulk-delete-notes',
  auth: 'required',
  require: 'post.delete',
  destructive: true,
  tags: ['bulk', 'dangerous'],
  rateLimit: { max: 5, window: '1m' },

  // Cap at 10 items per call
  maxItems: { field: 'ids', limit: 10 },

  // Middleware: audit log before proceeding
  middleware: async (args, ctx, next) => {
    console.log(
      `[audit] bulk-delete-notes: user=${ctx.mcpAuth?.userId} `
      + `deleting ${args.ids.length} notes`,
    )
    return next()
  },

  // Preview: resolve titles so the agent knows what it's deleting
  preview: async (args) => {
    const notes = await Promise.all(
      args.ids.map(id => serverConvexQuery(api.notes.get, { id })),
    )
    const found = notes.filter(Boolean)
    const missing = args.ids.length - found.length

    if (found.length === 0) {
      return { summary: 'None of the specified notes exist', blocked: true }
    }

    const titles = found.map(n => `"${n!.title}"`).join(', ')
    return {
      summary: `Will permanently delete ${found.length} note${found.length === 1 ? '' : 's'}: ${titles}`,
      warn: missing > 0 ? `${missing} ID(s) not found and will be skipped` : undefined,
      affects: { notes: found.length },
    }
  },

  handler: async (args) => {
    let deleted = 0
    const skipped: { id: string; reason: string }[] = []

    for (const id of args.ids) {
      try {
        await serverConvexMutation(api.notes.remove, { id })
        deleted++
      }
      catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.warn(`[bulk-delete-notes] Failed to delete ${id}: ${reason}`)
        skipped.push({ id, reason })
      }
    }

    return { deleted, skipped, total: args.ids.length }
  },
})

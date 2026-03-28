/**
 * MCP Tool: Update Note (Level 2+ — middleware with ctx.can)
 *
 * Demonstrates:
 * - middleware with ctx.can() for fine-grained ownership checks
 * - auth: 'required' (without `require` — permission checked in middleware instead)
 * - wrapError from middleware to block execution
 */
import { wrapError } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation, serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { updateNoteArgs, updateNoteMeta } from '../../../shared/schemas/note'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(updateNoteArgs, updateNoteMeta)

export default defineConvexTool({
  schema,
  name: 'update-note',
  auth: 'required',

  // No `require` — we do the permission check ourselves in middleware
  // to demonstrate ctx.can() with ownership-based access
  middleware: async (args, ctx, next) => {
    // Fetch the note to check ownership
    const note = await serverConvexQuery(api.notes.get, { id: args.id })
    if (!note) {
      return wrapError('not_found', `Note "${args.id}" not found.`)
    }

    // Use ctx.can() with the resource for ownership-based permission check
    // post.update: { own: ['member'], any: ['owner', 'admin'] }
    const allowed = ctx.can('post.update', { ownerId: note.userId })
    if (!allowed) {
      return wrapError('auth', 'You do not have permission to update this note.')
    }

    return next()
  },

  handler: async (args) => {
    await serverConvexMutation(api.notes.update, args)
    return { updated: true, id: args.id }
  },
})

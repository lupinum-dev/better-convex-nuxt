/**
 * Why this file exists:
 * Upload URLs are a legitimate reason to use the raw Convex escape hatch.
 * This handler only needs "are you signed in?" because the actual file becomes workspace-scoped
 * later when comments attach the returned storage id.
 *
 * Deliberate tradeoff for this example:
 * already-saved attachments are not opened through Convex in this pass. The only preview here is
 * the client-side object URL before submit. Any later download path must be scoped through the
 * owning comment or task, not raw `_storage`.
 */
import { authorize } from 'better-convex-nuxt/auth'

import { mutation } from './_generated/server'
import { getActor } from './auth/actor'
import { isAuthenticated } from './auth/checks'

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    // Upload URLs are actor-gated, but they are not tied to a specific task or project yet.
    authorize(actor, 'Generate upload URL', isAuthenticated)
    return await ctx.storage.generateUploadUrl()
  },
})

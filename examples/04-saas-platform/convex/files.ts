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
import { enforce } from 'better-convex-nuxt/auth'

import { isAuthenticated } from './auth/checks'
import { appMutation } from './functions'

export const generateUploadUrl = appMutation({
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    // Upload URLs are actor-gated, but they are not tied to a specific task or project yet.
    enforce(actor, 'Generate upload URL', isAuthenticated)
    return await ctx.storage.generateUploadUrl()
  },
})

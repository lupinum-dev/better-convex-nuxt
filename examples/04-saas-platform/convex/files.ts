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
import { requireAuth } from '@lupinum/trellis/auth'
import type { ActorAccessor } from '@lupinum/trellis/functions'
import type { GenericMutationCtx } from 'convex/server'

import type { DataModel } from './_generated/dataModel'
import type { Actor } from './auth/actor'
import { raw } from './functions'

type Ctx = GenericMutationCtx<DataModel> & { actor: ActorAccessor<Actor> }

export const generateUploadUrl = raw.mutation({
  args: {},
  handler: async (ctx: Ctx) => {
    const actor = await ctx.actor()
    // Upload URLs are actor-gated, but they are not tied to a specific task or project yet.
    requireAuth(actor)
    return await (
      ctx as unknown as { storage: { generateUploadUrl(): Promise<string> } }
    ).storage.generateUploadUrl()
  },
})

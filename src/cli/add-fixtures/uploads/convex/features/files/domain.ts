/**
 * Why this file exists:
 * Upload URLs are a legitimate reason to use the unsafe Trellis handler builder.
 * This handler only needs "are you signed in?" because the actual file becomes tenant-scoped
 * later when another record attaches the returned storage id.
 */
import { requireAuth } from '@lupinum/trellis/auth'
import type { ActorAccessor } from '@lupinum/trellis/backend'
import type { GenericMutationCtx } from 'convex/server'

import { generateUploadUrl as generateUploadUrlContract } from '../../../shared/features/files/contract'
import type { DataModel } from '../../_generated/dataModel'
import type { Actor } from '../../auth/actor'
import { mutation } from '../../functions'

type Ctx = GenericMutationCtx<DataModel> & { actor: ActorAccessor<Actor> }

export const generateUploadUrlMutation = mutation.unsafe({
  bypass: 'Generate upload URLs before a concrete tenant-scoped record exists.',
  args: generateUploadUrlContract.args,
  handler: async (ctx: Ctx) => {
    const actor = await ctx.actor()
    requireAuth(actor)
    return await (
      ctx as unknown as { storage: { generateUploadUrl(): Promise<string> } }
    ).storage.generateUploadUrl()
  },
})

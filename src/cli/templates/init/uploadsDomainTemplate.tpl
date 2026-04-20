import { requireAuth } from '@lupinum/trellis/auth'
import type { ActorAccessor } from '@lupinum/trellis/functions'
import type { GenericMutationCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { Actor } from '../auth/actor'
import { raw } from '../functions'

type Ctx = GenericMutationCtx<DataModel> & { actor: ActorAccessor<Actor> }

export const generateUploadUrl = raw.mutation({
  args: {},
  handler: async (ctx: Ctx) => {
    requireAuth(await ctx.actor())
    return await (
      ctx as unknown as { storage: { generateUploadUrl(): Promise<string> } }
    ).storage.generateUploadUrl()
  },
})

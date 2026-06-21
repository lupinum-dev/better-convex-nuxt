import { v } from 'convex/values'

import { mutation } from './_generated/server'

export const revoke = mutation({
  args: {
    credentialId: v.id('agentCredentials')
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.credentialId, {
      status: 'revoked',
      revokedAt: Date.now()
    })
  }
})


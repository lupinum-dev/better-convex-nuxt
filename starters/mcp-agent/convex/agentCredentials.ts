import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireServiceCredentialManager } from './access'

export const revoke = mutation({
  args: {
    credentialId: v.id('agentCredentials')
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db.get(args.credentialId)
    if (!credential) {
      throw new ConvexError('Credential not found')
    }

    await requireServiceCredentialManager(ctx, credential.organizationId)
    await ctx.db.patch(args.credentialId, {
      status: 'revoked',
      revokedAt: Date.now()
    })
  }
})

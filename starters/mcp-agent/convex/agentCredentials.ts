import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireServiceCredentialManager, writeAuditEvent } from './access'
import { organizationUserKey, rateLimiter } from './rateLimits'

export const revoke = mutation({
  args: {
    credentialId: v.id('agentCredentials'),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db.get(args.credentialId)
    if (!credential) {
      throw new ConvexError('Credential not found')
    }

    const user = await requireServiceCredentialManager(ctx, credential.organizationId)
    await rateLimiter.limit(ctx, 'humanCredentialRevoke', {
      key: organizationUserKey(credential.organizationId, user._id),
      throws: true,
    })
    await ctx.db.patch(args.credentialId, {
      status: 'revoked',
      revokedAt: Date.now(),
    })
    await writeAuditEvent(ctx, {
      organizationId: credential.organizationId,
      actor: { kind: 'user', userId: user._id },
      action: 'agentCredentials.revoke',
      resourceType: 'agentCredential',
      source: 'human',
      resourceId: args.credentialId,
    })
  },
})

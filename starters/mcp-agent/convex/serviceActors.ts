import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { roleValidator } from './schema'

export const createForDemo = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    role: roleValidator,
    credentialHash: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const serviceActorId = await ctx.db.insert('serviceActors', {
      organizationId: args.organizationId,
      name: args.name,
      role: args.role,
      status: 'active',
      createdAt: now,
      updatedAt: now
    })

    await ctx.db.insert('agentCredentials', {
      serviceActorId,
      organizationId: args.organizationId,
      secretHash: args.credentialHash,
      status: 'active',
      createdAt: now
    })

    return serviceActorId
  }
})


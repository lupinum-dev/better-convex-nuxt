import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireServiceCredentialManager } from './access'
import { serviceActorRoleValidator } from './schema'

const sha256HexPattern = /^[a-f0-9]{64}$/

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    role: serviceActorRoleValidator,
    credentialHash: v.string()
  },
  handler: async (ctx, args) => {
    await requireServiceCredentialManager(ctx, args.organizationId)
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Service actor name is required')
    }

    const credentialHash = args.credentialHash.trim()
    if (!credentialHash) {
      throw new ConvexError('Credential hash is required')
    }
    if (!sha256HexPattern.test(credentialHash)) {
      throw new ConvexError('Credential hash must be a SHA-256 hex digest')
    }

    const existingCredential = await ctx.db
      .query('agentCredentials')
      .withIndex('by_secret_hash', (q) => q.eq('secretHash', credentialHash))
      .first()
    if (existingCredential) {
      throw new ConvexError('Credential hash already exists')
    }

    const now = Date.now()
    const serviceActorId = await ctx.db.insert('serviceActors', {
      organizationId: args.organizationId,
      name,
      role: args.role,
      status: 'active',
      createdAt: now,
      updatedAt: now
    })

    await ctx.db.insert('agentCredentials', {
      serviceActorId,
      organizationId: args.organizationId,
      secretHash: credentialHash,
      status: 'active',
      createdAt: now
    })

    return serviceActorId
  }
})

export const listForOrganization = query({
  args: {
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireServiceCredentialManager(ctx, args.organizationId)

    const actors = await ctx.db
      .query('serviceActors')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .collect()

    return actors.map((actor) => ({
      id: actor._id,
      organizationId: actor.organizationId,
      name: actor.name,
      role: actor.role,
      status: actor.status,
      createdAt: actor.createdAt,
      updatedAt: actor.updatedAt
    }))
  }
})

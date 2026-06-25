import { ConvexError, v } from 'convex/values'

import { createServiceActorInputSchema } from '../shared/inputSchemas'
import { mutation, query } from './_generated/server'
import { requireServiceCredentialManager } from './access'
import { organizationUserKey, rateLimiter } from './rateLimits'
import { serviceActorRoleValidator } from './schema'
import { parseWithConvexError } from './validation'

function generateBearerSecret() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashBearerSecret(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    role: serviceActorRoleValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireServiceCredentialManager(ctx, args.organizationId)
    await rateLimiter.limit(ctx, 'humanServiceActorCreate', {
      key: organizationUserKey(args.organizationId, user._id),
      throws: true,
    })
    const { name, role } = parseWithConvexError(createServiceActorInputSchema, args)
    const bearerToken = generateBearerSecret()
    const credentialHash = await hashBearerSecret(bearerToken)

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
      role,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('agentCredentials', {
      serviceActorId,
      organizationId: args.organizationId,
      secretHash: credentialHash,
      status: 'active',
      createdAt: now,
    })

    return { serviceActorId, bearerToken }
  },
})

export const listForOrganization = query({
  args: {
    organizationId: v.id('organizations'),
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
      updatedAt: actor.updatedAt,
    }))
  },
})

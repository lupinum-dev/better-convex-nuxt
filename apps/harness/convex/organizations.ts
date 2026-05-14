import { defineArgs } from '@lupinum/trellis/args'
import { defineGuard } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import type { AppIdentity } from './auth/appIdentity'
import { mutation, query } from './functions'
import { getUserRowFromActor } from './lib/user_row'

const createOrganizationArgs = defineArgs({
  args: {
    name: v.string(),
    slug: v.string(),
  },
})

const canCreateOrganization = defineGuard<AppIdentity>(
  'Create organization',
  (appIdentity) => appIdentity !== null,
)

export const list = query.public({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('organizations').order('desc').collect()
  },
})

export const create = mutation.protected({
  args: createOrganizationArgs.args,
  identityForwardingFunctionRef: 'organizations:create',
  guard: canCreateOrganization,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    const user = await getUserRowFromActor(ctx.db, appIdentity)
    if (!user) throw new Error('User not found')

    const existing = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('Organization slug already exists')

    const orgId = await ctx.db.insert('organizations', {
      name: args.name,
      slug: args.slug,
      ownerId: appIdentity.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await ctx.db.patch(user._id, {
      organizationId: orgId,
      role: 'owner',
      updatedAt: Date.now(),
    })

    return orgId
  },
})

import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { authComponent, createAuth } from './auth'

type ProjectPermission = 'create' | 'read'

async function requireProjectPermission(
  ctx: Parameters<typeof authComponent.getHeaders>[0],
  args: {
    organizationId: string
    permission: ProjectPermission
  },
) {
  const headers = await authComponent.getHeaders(ctx)
  const auth = createAuth(ctx)
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw new ConvexError('Unauthenticated')
  }

  const allowed = await auth.api.hasPermission({
    headers,
    body: {
      organizationId: args.organizationId,
      permissions: {
        project: [args.permission],
      },
    },
  })

  if (!allowed.success) {
    throw new ConvexError(`Missing project:${args.permission} permission`)
  }

  return session.user
}

export const list = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectPermission(ctx, {
      organizationId: args.organizationId,
      permission: 'read',
    })

    return await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(100)
  },
})

export const create = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const user = await requireProjectPermission(ctx, {
      organizationId: args.organizationId,
      permission: 'create',
    })

    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name,
      createdByAuthUserId: user.id,
      createdAt: Date.now(),
    })

    await ctx.db.insert('auditEvents', {
      organizationId: args.organizationId,
      actorAuthUserId: user.id,
      action: 'projects.create',
      resourceType: 'project',
      resourceId: projectId,
      createdAt: Date.now(),
    })

    return projectId
  },
})

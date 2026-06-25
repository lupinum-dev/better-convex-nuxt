import { ConvexError, v } from 'convex/values'

import { createProjectInputSchema } from '../shared/inputSchemas'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import {
  requireMcpServerCall,
  requireOrganizationMembership,
  requireServiceActor,
  writeServiceAudit,
} from './access'
import { organizationUserKey, rateLimiter, serviceActorProjectKey } from './rateLimits'
import { parseWithConvexError } from './validation'

type ProjectCreator =
  | { kind: 'user'; userId: Id<'users'> }
  | { kind: 'serviceActor'; serviceActorId: Id<'serviceActors'> }

async function listProjectsForOrganization(ctx: QueryCtx, organizationId: Id<'organizations'>) {
  return await ctx.db
    .query('projects')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .order('desc')
    .collect()
}

async function createProject(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>
    name: string
    createdBy: ProjectCreator
  },
) {
  const { name } = parseWithConvexError(createProjectInputSchema, {
    name: args.name,
  })
  return await ctx.db.insert('projects', {
    organizationId: args.organizationId,
    name,
    createdBy: args.createdBy,
    createdAt: Date.now(),
  })
}

export const listForCurrentUser = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrganizationMembership(ctx, args.organizationId)
    return await listProjectsForOrganization(ctx, args.organizationId)
  },
})

export const createForCurrentUser = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrganizationMembership(ctx, args.organizationId, 'member')
    await rateLimiter.limit(ctx, 'humanProjectCreate', {
      key: organizationUserKey(args.organizationId, user._id),
      throws: true,
    })
    return await createProject(ctx, {
      organizationId: args.organizationId,
      name: args.name,
      createdBy: { kind: 'user', userId: user._id },
    })
  },
})

export const listForServiceActor = query({
  args: {
    serverSecret: v.string(),
    bearerToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireMcpServerCall(args.serverSecret)
    const { organizationId } = await requireServiceActor(ctx, args)
    return await listProjectsForOrganization(ctx, organizationId)
  },
})

export const createFromServiceActor = mutation({
  args: {
    serverSecret: v.string(),
    bearerToken: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    requireMcpServerCall(args.serverSecret)
    const { actor, organizationId } = await requireServiceActor(ctx, {
      ...args,
      minimumRole: 'member',
    })
    await rateLimiter.limit(ctx, 'serviceActorProjectCreate', {
      key: serviceActorProjectKey(organizationId, actor._id),
      throws: true,
    })

    const projectId = await createProject(ctx, {
      organizationId,
      name: args.name,
      createdBy: { kind: 'serviceActor', serviceActorId: actor._id },
    })

    await writeServiceAudit(ctx, {
      organizationId,
      serviceActorId: actor._id,
      action: 'projects.create',
      resourceType: 'project',
      resourceId: projectId,
    })

    return projectId
  },
})

export const deleteWithApproval = mutation({
  args: {
    serverSecret: v.string(),
    bearerToken: v.string(),
    projectId: v.id('projects'),
    approvalId: v.id('approvals'),
  },
  handler: async (ctx, args) => {
    requireMcpServerCall(args.serverSecret)
    const { actor, organizationId } = await requireServiceActor(ctx, {
      ...args,
      minimumRole: 'admin',
    })
    await rateLimiter.limit(ctx, 'serviceActorProjectDelete', {
      key: serviceActorProjectKey(organizationId, actor._id),
      throws: true,
    })
    const project = await ctx.db.get(args.projectId)
    if (!project || project.organizationId !== organizationId) {
      throw new ConvexError('Project not found')
    }

    const approval = await ctx.db.get(args.approvalId)
    if (
      !approval ||
      approval.organizationId !== organizationId ||
      approval.operation !== 'projects.delete' ||
      approval.resourceId !== args.projectId ||
      approval.status !== 'approved' ||
      approval.expiresAt <= Date.now()
    ) {
      throw new ConvexError('Approval required')
    }

    await ctx.db.delete(args.projectId)
    await ctx.db.patch(args.approvalId, {
      status: 'used',
      usedAt: Date.now(),
    })
    await writeServiceAudit(ctx, {
      organizationId,
      serviceActorId: actor._id,
      action: 'projects.delete',
      resourceType: 'project',
      resourceId: args.projectId,
    })
  },
})

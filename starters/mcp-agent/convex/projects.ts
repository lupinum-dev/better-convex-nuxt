import { ConvexError, v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import {
  requireOrganizationMembership,
  requireServiceActor,
  writeServiceAudit
} from './access'

const maxProjectNameLength = 120
type ProjectCreator =
  | { kind: 'user'; userId: Id<'users'> }
  | { kind: 'serviceActor'; serviceActorId: Id<'serviceActors'> }

function normalizeProjectName(name: string) {
  const normalized = name.trim()
  if (!normalized) {
    throw new ConvexError('Project name is required')
  }
  if (normalized.length > maxProjectNameLength) {
    throw new ConvexError('Project name is too long')
  }

  return normalized
}

async function listProjectsForOrganization(
  ctx: QueryCtx,
  organizationId: Id<'organizations'>
) {
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
  }
) {
  const name = normalizeProjectName(args.name)
  return await ctx.db.insert('projects', {
    organizationId: args.organizationId,
    name,
    createdBy: args.createdBy,
    createdAt: Date.now()
  })
}

export const listForCurrentUser = query({
  args: {
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireOrganizationMembership(ctx, args.organizationId)
    return await listProjectsForOrganization(ctx, args.organizationId)
  }
})

export const createForCurrentUser = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string()
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrganizationMembership(ctx, args.organizationId, 'member')
    return await createProject(ctx, {
      organizationId: args.organizationId,
      name: args.name,
      createdBy: { kind: 'user', userId: user._id }
    })
  }
})

export const listForServiceActor = query({
  args: {
    credentialHash: v.string(),
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireServiceActor(ctx, args)
    return await listProjectsForOrganization(ctx, args.organizationId)
  }
})

export const createFromServiceActor = mutation({
  args: {
    credentialHash: v.string(),
    organizationId: v.id('organizations'),
    name: v.string()
  },
  handler: async (ctx, args) => {
    const actor = await requireServiceActor(ctx, {
      ...args,
      minimumRole: 'member'
    })

    const projectId = await createProject(ctx, {
      organizationId: args.organizationId,
      name: args.name,
      createdBy: { kind: 'serviceActor', serviceActorId: actor._id }
    })

    await writeServiceAudit(ctx, {
      organizationId: args.organizationId,
      serviceActorId: actor._id,
      action: 'projects.create',
      resourceType: 'project',
      resourceId: projectId
    })

    return projectId
  }
})

export const deleteWithApproval = mutation({
  args: {
    credentialHash: v.string(),
    organizationId: v.id('organizations'),
    projectId: v.id('projects'),
    approvalId: v.id('approvals')
  },
  handler: async (ctx, args) => {
    const actor = await requireServiceActor(ctx, {
      ...args,
      minimumRole: 'admin'
    })
    const project = await ctx.db.get(args.projectId)
    if (!project || project.organizationId !== args.organizationId) {
      throw new ConvexError('Project not found')
    }

    const approval = await ctx.db.get(args.approvalId)
    if (
      !approval ||
      approval.organizationId !== args.organizationId ||
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
      usedAt: Date.now()
    })
    await writeServiceAudit(ctx, {
      organizationId: args.organizationId,
      serviceActorId: actor._id,
      action: 'projects.delete',
      resourceType: 'project',
      resourceId: args.projectId
    })
  }
})

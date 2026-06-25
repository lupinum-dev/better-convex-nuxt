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
  const projects = await ctx.db
    .query('projects')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .order('desc')
    .collect()
  return projects.filter((project) => project.status !== 'deleted')
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
    status: 'active',
    createdAt: Date.now(),
  })
}

async function buildProjectDeletePreview(
  ctx: QueryCtx | MutationCtx,
  args: {
    bearerToken: string
    projectId: Id<'projects'>
  },
) {
  const target = await requireProjectDeleteTarget(ctx, args)

  return {
    status: 'ready' as const,
    operation: 'projects.delete' as const,
    riskLevel: 'approval_required' as const,
    requiresApproval: true,
    reversible: true,
    approvalReason: 'Organization project deletion requires an app-owned admin approval.',
    canRequestApproval: true,
    canExecute: false,
    resource: {
      type: 'project' as const,
      id: target.project._id,
      label: target.project.name,
      organizationId: target.organizationId,
    },
    actor: {
      type: 'serviceActor' as const,
      id: target.actor._id,
      role: target.actor.role,
    },
    effects: [
      {
        type: 'update' as const,
        table: 'projects' as const,
        id: target.project._id,
        label: target.project.name,
        fields: ['status', 'deletedAt', 'deletedBy'],
      },
      {
        type: 'audit' as const,
        table: 'auditEvents' as const,
        action: 'projects.delete',
      },
    ],
    warnings: ['The starter uses soft delete so this project can be restored in a production app.'],
    nextActions: [
      {
        tool: 'projects.delete.requestApproval',
        arguments: {
          projectId: target.project._id,
        },
      },
    ],
  }
}

async function requireProjectDeleteTarget(
  ctx: QueryCtx | MutationCtx,
  args: {
    bearerToken: string
    projectId: Id<'projects'>
  },
) {
  const { actor, organizationId } = await requireServiceActor(ctx, {
    bearerToken: args.bearerToken,
    minimumRole: 'admin',
  })
  const project = await ctx.db.get(args.projectId)
  if (!project || project.organizationId !== organizationId || project.status === 'deleted') {
    throw new ConvexError('Project not found')
  }

  return {
    actor,
    organizationId,
    project,
  }
}

function toWaitingForApprovalResponse(args: {
  approvalRequestId: Id<'approvals'>
  projectId: Id<'projects'>
  message: string
  expiresAt: number
}) {
  return {
    status: 'waiting_for_approval' as const,
    approvalRequestId: args.approvalRequestId,
    message: args.message,
    expiresAt: args.expiresAt,
    nextActions: [
      {
        tool: 'approvals.get',
        arguments: { approvalRequestId: args.approvalRequestId },
      },
      {
        tool: 'projects.delete.execute',
        arguments: { projectId: args.projectId, approvalId: args.approvalRequestId },
      },
    ],
  }
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

export const previewCreateFromServiceActor = query({
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
    const { name } = parseWithConvexError(createProjectInputSchema, {
      name: args.name,
    })

    return {
      status: 'ready' as const,
      operation: 'projects.create' as const,
      riskLevel: 'low' as const,
      requiresApproval: false,
      reversible: true,
      approvalReason: null,
      normalizedInput: {
        name,
      },
      actor: {
        type: 'serviceActor' as const,
        id: actor._id,
        role: actor.role,
      },
      resource: {
        type: 'project' as const,
        organizationId,
        label: name,
      },
      effects: [
        {
          type: 'insert' as const,
          table: 'projects' as const,
          label: name,
        },
        {
          type: 'audit' as const,
          table: 'auditEvents' as const,
          action: 'projects.create',
        },
      ],
      warnings: [],
      nextActions: [
        {
          tool: 'projects.create',
          arguments: {
            name,
          },
        },
      ],
    }
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

export const previewDeleteFromServiceActor = query({
  args: {
    serverSecret: v.string(),
    bearerToken: v.string(),
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    requireMcpServerCall(args.serverSecret)
    return await buildProjectDeletePreview(ctx, args)
  },
})

export const requestDeleteApprovalFromServiceActor = mutation({
  args: {
    serverSecret: v.string(),
    bearerToken: v.string(),
    projectId: v.id('projects'),
    reason: v.optional(v.string()),
    requestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireMcpServerCall(args.serverSecret)
    const target = await requireProjectDeleteTarget(ctx, args)
    const now = Date.now()
    const trimmedRequestKey = args.requestKey?.trim()

    if (trimmedRequestKey) {
      const existing = await ctx.db
        .query('approvals')
        .withIndex('by_request_key', (q) =>
          q
            .eq('organizationId', target.organizationId)
            .eq('operation', 'projects.delete')
            .eq('resourceId', args.projectId)
            .eq('requestKey', trimmedRequestKey),
        )
        .unique()
      if (existing) {
        if (existing.status === 'pending' && existing.expiresAt > now) {
          return toWaitingForApprovalResponse({
            approvalRequestId: existing._id,
            projectId: args.projectId,
            message: 'Approval request already exists.',
            expiresAt: existing.expiresAt,
          })
        }

        return {
          status: 'blocked' as const,
          reason:
            existing.expiresAt <= now && existing.status !== 'used'
              ? 'approval_expired'
              : `approval_${existing.status}`,
          message: 'This request key was already used. Create a new request with a new requestKey.',
          approvalRequestId: existing._id,
          nextActions: [
            {
              tool: 'projects.delete.requestApproval',
              arguments: { projectId: args.projectId },
            },
          ],
        }
      }
    }

    await rateLimiter.limit(ctx, 'serviceActorProjectDeleteApproval', {
      key: serviceActorProjectKey(target.organizationId, target.actor._id),
      throws: true,
    })

    const expiresAt = now + 5 * 60 * 1000
    const approvalRequestId = await ctx.db.insert('approvals', {
      organizationId: target.organizationId,
      operation: 'projects.delete',
      resourceId: args.projectId,
      status: 'pending',
      requestedBy: target.actor._id,
      requestedReason: args.reason?.trim() || 'MCP agent requested project deletion.',
      requestKey: trimmedRequestKey || undefined,
      preview: {
        resourceLabel: target.project.name,
        effects: [
          {
            type: 'update',
            table: 'projects',
            id: target.project._id,
            label: target.project.name,
          },
          {
            type: 'audit',
            table: 'auditEvents',
            action: 'projects.delete',
          },
        ],
      },
      expiresAt,
      createdAt: now,
    })

    return toWaitingForApprovalResponse({
      approvalRequestId,
      projectId: args.projectId,
      message: 'Approval request created. Ask an organization admin to approve it in the app.',
      expiresAt,
    })
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
    const target = await requireProjectDeleteTarget(ctx, args)
    const actorId = target.actor._id
    const organizationId = target.organizationId
    await rateLimiter.limit(ctx, 'serviceActorProjectDelete', {
      key: serviceActorProjectKey(organizationId, actorId),
      throws: true,
    })

    const now = Date.now()
    const approval = await ctx.db.get(args.approvalId)
    if (
      !approval ||
      approval.organizationId !== organizationId ||
      approval.operation !== 'projects.delete' ||
      approval.resourceId !== args.projectId ||
      approval.status !== 'approved' ||
      approval.expiresAt <= now
    ) {
      throw new ConvexError('Approval required')
    }

    await ctx.db.patch(args.projectId, {
      status: 'deleted',
      deletedAt: now,
      deletedBy: actorId,
    })
    await ctx.db.patch(args.approvalId, {
      status: 'used',
      usedAt: now,
    })
    await writeServiceAudit(ctx, {
      organizationId,
      serviceActorId: actorId,
      action: 'projects.delete',
      resourceType: 'project',
      resourceId: args.projectId,
    })

    return {
      status: 'executed' as const,
      operation: 'projects.delete' as const,
      projectId: args.projectId,
      approvalId: args.approvalId,
      message: `Soft-deleted project ${target.project.name}.`,
    }
  },
})

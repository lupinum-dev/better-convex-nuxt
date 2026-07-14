import { ConvexError, v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import {
  requireMcpServerCall,
  requireOrganizationAdmin,
  requireServiceActor,
  writeAuditEvent,
} from './access'
import { organizationUserKey, rateLimiter } from './rateLimits'

function publicApprovalStatus(approval: {
  status: 'pending' | 'approved' | 'rejected' | 'used'
  expiresAt: number
}) {
  if (
    (approval.status === 'pending' || approval.status === 'approved') &&
    approval.expiresAt <= Date.now()
  ) {
    return 'expired'
  }

  return approval.status
}

async function requirePendingApprovalAdmin(
  ctx: QueryCtx | MutationCtx,
  args: {
    approvalRequestId: Id<'approvals'>
  },
) {
  const approval = await ctx.db.get(args.approvalRequestId)
  if (!approval || approval.operation !== 'projects.delete') {
    throw new ConvexError('Approval request not found')
  }
  const user = await requireOrganizationAdmin(ctx, approval.organizationId)
  if (publicApprovalStatus(approval) !== 'pending') {
    throw new ConvexError('Approval request is not pending')
  }

  return { approval, user }
}

export const listPending = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrganizationAdmin(ctx, args.organizationId)
    const approvals = await ctx.db
      .query('approvals')
      .withIndex('by_org_status_expires', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('status', 'pending')
          .gt('expiresAt', Date.now()),
      )
      .order('desc')
      .take(100)

    return approvals.map((approval) => ({
      id: approval._id,
      operation: approval.operation,
      resourceId: approval.resourceId,
      status: 'pending' as const,
      requestedReason: approval.requestedReason ?? null,
      preview: approval.preview ?? null,
      expiresAt: approval.expiresAt,
      createdAt: approval.createdAt,
    }))
  },
})

export const getForServiceActor = query({
  args: {
    serverSecret: v.string(),
    bearerToken: v.string(),
    approvalRequestId: v.id('approvals'),
  },
  handler: async (ctx, args) => {
    requireMcpServerCall(args.serverSecret)
    const { actor, organizationId } = await requireServiceActor(ctx, args)
    const approval = await ctx.db.get(args.approvalRequestId)
    if (
      !approval ||
      approval.organizationId !== organizationId ||
      approval.requestedBy !== actor._id
    ) {
      throw new ConvexError('Approval request not found')
    }

    const status = publicApprovalStatus(approval)
    return {
      approvalRequestId: approval._id,
      operation: approval.operation,
      resourceId: approval.resourceId,
      status,
      message:
        status === 'approved'
          ? 'Approval granted. Execute the approved action before it expires.'
          : status === 'pending'
            ? 'Approval is still pending in the app.'
            : status === 'rejected'
              ? 'Approval was rejected. Do not execute this action.'
              : status === 'used'
                ? 'Approval was already used.'
                : 'Approval expired. Request a new approval if the action is still needed.',
      expiresAt: approval.expiresAt,
      nextActions:
        status === 'approved'
          ? [
              {
                tool: 'projects.delete.execute',
                arguments: {
                  projectId: approval.resourceId,
                  approvalId: approval._id,
                },
              },
            ]
          : [],
    }
  },
})

export const approveProjectDelete = mutation({
  args: {
    approvalRequestId: v.id('approvals'),
  },
  handler: async (ctx, args) => {
    const { approval, user } = await requirePendingApprovalAdmin(ctx, args)
    await rateLimiter.limit(ctx, 'humanProjectDeleteApproval', {
      key: organizationUserKey(approval.organizationId, user._id),
      throws: true,
    })
    const now = Date.now()
    await ctx.db.patch(args.approvalRequestId, {
      status: 'approved',
      approvedBy: user._id,
      approvedAt: now,
    })
    await writeAuditEvent(ctx, {
      organizationId: approval.organizationId,
      actor: { kind: 'user', userId: user._id },
      action: 'approvals.approve',
      resourceType: 'approval',
      source: 'human',
      resourceId: args.approvalRequestId,
    })

    return args.approvalRequestId
  },
})

export const rejectProjectDelete = mutation({
  args: {
    approvalRequestId: v.id('approvals'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { approval, user } = await requirePendingApprovalAdmin(ctx, args)
    const rejectionReason = args.reason?.trim()
    if (rejectionReason && rejectionReason.length > 1_000) {
      throw new ConvexError('Rejection reason must be 1000 characters or less')
    }
    const now = Date.now()
    await ctx.db.patch(args.approvalRequestId, {
      status: 'rejected',
      rejectedBy: user._id,
      rejectedAt: now,
      rejectionReason: rejectionReason || undefined,
    })
    await writeAuditEvent(ctx, {
      organizationId: approval.organizationId,
      actor: { kind: 'user', userId: user._id },
      action: 'approvals.reject',
      resourceType: 'approval',
      source: 'human',
      resourceId: args.approvalRequestId,
    })

    return args.approvalRequestId
  },
})

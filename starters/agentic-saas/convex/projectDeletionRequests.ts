import { ConvexError, v } from 'convex/values'

import { internalMutation, mutation, query } from './_generated/server'
import { requireDelegatingUserCurrentProjectPermission } from './agentRuns'
import { requireBetterAuthProjectPermissions } from './betterAuthPermissions'
import { deleteProductRecordForApproval } from './productRecords'
import { maxDeletionReasonLength, maxPendingReviewsPerQueue } from './resourceBounds'

export const createFromAgent = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
    productRecordId: v.id('productRecords'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.reason.length > maxDeletionReasonLength) {
      throw new ConvexError(`Deletion reason must be ${maxDeletionReasonLength} characters or less`)
    }
    const reason = args.reason.trim()
    if (!reason) {
      throw new ConvexError('Deletion reason is required')
    }

    const record = await ctx.db.get(args.productRecordId)
    if (!record) {
      throw new ConvexError('Product record not found')
    }

    const { actor } = await requireDelegatingUserCurrentProjectPermission(ctx, {
      agentRunId: args.agentRunId,
      organizationId: record.organizationId,
      capability: 'project:delete',
      permission: 'delete',
    })
    const pendingRequests = await ctx.db
      .query('projectDeletionRequests')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', record.organizationId).eq('status', 'pending'),
      )
      .take(maxPendingReviewsPerQueue)
    if (pendingRequests.length >= maxPendingReviewsPerQueue) {
      throw new ConvexError('Deletion review queue is full')
    }

    const pendingRequest = pendingRequests.find(
      (request) => request.productRecordId === args.productRecordId,
    )
    if (pendingRequest) {
      throw new ConvexError('Deletion request already pending')
    }

    const requestId = await ctx.db.insert('projectDeletionRequests', {
      organizationId: record.organizationId,
      productRecordId: args.productRecordId,
      reason,
      status: 'pending',
      sourceAgentRunId: args.agentRunId,
      createdAt: Date.now(),
    })

    await ctx.db.insert('agentAuditEvents', {
      organizationId: record.organizationId,
      actor,
      action: 'projectDeletionRequests.create',
      capability: 'project:delete',
      resourceType: 'projectDeletionRequest',
      resourceId: requestId,
      createdAt: Date.now(),
    })

    return requestId
  },
})

export const listPending = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireBetterAuthProjectPermissions(ctx, {
      organizationId: args.organizationId,
      permissions: ['read'],
      deniedMessage: 'Missing project:read permission',
    })

    return await ctx.db
      .query('projectDeletionRequests')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', args.organizationId).eq('status', 'pending'),
      )
      .order('desc')
      .take(maxPendingReviewsPerQueue)
  },
})

export const approve = mutation({
  args: {
    deletionRequestId: v.id('projectDeletionRequests'),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.deletionRequestId)
    if (!request) {
      throw new ConvexError('Deletion request not found')
    }

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: request.organizationId,
      permissions: ['delete'],
      deniedMessage: 'Missing project:delete permission',
    })

    if (request.status !== 'pending') {
      throw new ConvexError('Only pending deletion requests can be approved')
    }

    await deleteProductRecordForApproval(ctx, {
      deletionRequestId: args.deletionRequestId,
      deletedByAuthUserId: user.id,
    })

    await ctx.db.patch(args.deletionRequestId, {
      status: 'approved',
      decidedAt: Date.now(),
    })
  },
})

export const reject = mutation({
  args: {
    deletionRequestId: v.id('projectDeletionRequests'),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.deletionRequestId)
    if (!request) {
      throw new ConvexError('Deletion request not found')
    }

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: request.organizationId,
      permissions: ['delete'],
      deniedMessage: 'Missing project:delete permission',
    })

    if (request.status !== 'pending') {
      throw new ConvexError('Only pending deletion requests can be rejected')
    }

    const now = Date.now()
    await ctx.db.patch(args.deletionRequestId, {
      status: 'rejected',
      decidedAt: now,
    })

    await ctx.db.insert('productAuditEvents', {
      organizationId: request.organizationId,
      actor: {
        kind: 'user',
        authUserId: user.id,
      },
      action: 'projectDeletionRequests.reject',
      resourceType: 'projectDeletionRequest',
      resourceId: args.deletionRequestId,
      sourceDeletionRequestId: args.deletionRequestId,
      createdAt: now,
    })
  },
})

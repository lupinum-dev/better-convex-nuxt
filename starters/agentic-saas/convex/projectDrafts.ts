import { ConvexError, v } from 'convex/values'

import { internalMutation, mutation, query } from './_generated/server'
import { requireAgentCapability } from './agentRuns'
import { requireBetterAuthProjectPermissions } from './betterAuthPermissions'
import { createProductRecordFromDraft } from './productRecords'

export const createFromAgent = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim()
    const body = args.body.trim()
    if (!title || !body) {
      throw new ConvexError('Draft title and body are required')
    }

    const { actor, run } = await requireAgentCapability(ctx, {
      agentRunId: args.agentRunId,
      capability: 'project:draft',
    })

    const draftId = await ctx.db.insert('projectDrafts', {
      organizationId: run.organizationId,
      title,
      body,
      status: 'pending',
      sourceAgentRunId: args.agentRunId,
      createdAt: Date.now(),
    })

    await ctx.db.insert('agentAuditEvents', {
      organizationId: run.organizationId,
      actor,
      action: 'projectDrafts.create',
      capability: 'project:draft',
      resourceType: 'projectDraft',
      resourceId: draftId,
      createdAt: Date.now(),
    })

    return draftId
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
      .query('projectDrafts')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', args.organizationId).eq('status', 'pending'),
      )
      .order('desc')
      .collect()
  },
})

export const approve = mutation({
  args: {
    draftId: v.id('projectDrafts'),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) {
      throw new ConvexError('Draft not found')
    }

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: draft.organizationId,
      permissions: ['create'],
      deniedMessage: 'Missing project:create permission',
    })

    return await createProductRecordFromDraft(ctx, {
      draftId: args.draftId,
      approvedByAuthUserId: user.id,
    })
  },
})

export const reject = mutation({
  args: {
    draftId: v.id('projectDrafts'),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) {
      throw new ConvexError('Draft not found')
    }

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: draft.organizationId,
      permissions: ['create'],
      deniedMessage: 'Missing project:create permission',
    })

    if (draft.status !== 'pending') {
      throw new ConvexError('Only pending drafts can be rejected')
    }

    const now = Date.now()
    await ctx.db.patch(args.draftId, {
      status: 'rejected',
      decidedAt: now,
    })

    await ctx.db.insert('productAuditEvents', {
      organizationId: draft.organizationId,
      actor: {
        kind: 'user',
        authUserId: user.id,
      },
      action: 'projectDrafts.reject',
      resourceType: 'projectDraft',
      resourceId: args.draftId,
      sourceDraftId: args.draftId,
      createdAt: now,
    })
  },
})

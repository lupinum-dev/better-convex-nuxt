import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireOrgAccess } from './access'
import { writeAuditEvent } from './audit'

export const approveDraft = mutation({
  args: {
    organizationId: v.id('organizations'),
    draftId: v.id('drafts')
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAccess(ctx, args.organizationId, 'reviewer')
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.organizationId !== args.organizationId) {
      throw new ConvexError('Draft not found')
    }

    if (draft.status !== 'pending') {
      throw new ConvexError('Only pending drafts can be approved')
    }

    const now = Date.now()
    const domainRecordId = await ctx.db.insert('domainRecords', {
      organizationId: args.organizationId,
      title: draft.title,
      body: draft.body,
      sourceDraftId: draft._id,
      approvedBy: user._id,
      createdAt: now
    })

    await ctx.db.patch(draft._id, {
      status: 'approved',
      decidedAt: now
    })

    await writeAuditEvent(ctx, {
      organizationId: args.organizationId,
      actorUserId: user._id,
      action: 'drafts.approve',
      sourceDraftId: draft._id,
      domainRecordId
    })

    return domainRecordId
  }
})

export const rejectDraft = mutation({
  args: {
    organizationId: v.id('organizations'),
    draftId: v.id('drafts')
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAccess(ctx, args.organizationId, 'reviewer')
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.organizationId !== args.organizationId) {
      throw new ConvexError('Draft not found')
    }

    if (draft.status !== 'pending') {
      throw new ConvexError('Only pending drafts can be rejected')
    }

    const now = Date.now()
    await ctx.db.patch(draft._id, {
      status: 'rejected',
      decidedAt: now
    })

    await writeAuditEvent(ctx, {
      organizationId: args.organizationId,
      actorUserId: user._id,
      action: 'drafts.reject',
      sourceDraftId: draft._id
    })
  }
})

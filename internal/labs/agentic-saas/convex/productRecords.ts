import { ConvexError } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function createProductRecordFromDraft(
  ctx: MutationCtx,
  args: {
    draftId: Id<'projectDrafts'>
    approvedByAuthUserId: string
  },
) {
  const draft = await ctx.db.get(args.draftId)
  if (!draft) {
    throw new ConvexError('Draft not found')
  }

  if (draft.status !== 'pending') {
    throw new ConvexError('Only pending drafts can be approved')
  }

  const now = Date.now()
  const recordId = await ctx.db.insert('productRecords', {
    organizationId: draft.organizationId,
    title: draft.title,
    body: draft.body,
    sourceDraftId: args.draftId,
    approvedByAuthUserId: args.approvedByAuthUserId,
    createdAt: now,
  })

  await ctx.db.patch(args.draftId, {
    status: 'approved',
    decidedAt: now,
  })

  await ctx.db.insert('productAuditEvents', {
    organizationId: draft.organizationId,
    actor: {
      kind: 'user',
      authUserId: args.approvedByAuthUserId,
    },
    action: 'projectDrafts.approve',
    resourceType: 'productRecord',
    resourceId: recordId,
    sourceDraftId: args.draftId,
    createdAt: now,
  })

  return recordId
}

export async function deleteProductRecordForApproval(
  ctx: MutationCtx,
  args: {
    deletionRequestId: Id<'projectDeletionRequests'>
    deletedByAuthUserId: string
  },
) {
  const request = await ctx.db.get(args.deletionRequestId)
  if (!request) {
    throw new ConvexError('Deletion request not found')
  }

  if (request.status !== 'pending') {
    throw new ConvexError('Only pending deletion requests can be approved')
  }

  const record = await ctx.db.get(request.productRecordId)
  if (!record || record.organizationId !== request.organizationId) {
    throw new ConvexError('Product record not found')
  }

  const now = Date.now()
  await ctx.db.delete(request.productRecordId)

  await ctx.db.insert('productAuditEvents', {
    organizationId: request.organizationId,
    actor: {
      kind: 'user',
      authUserId: args.deletedByAuthUserId,
    },
    action: 'productRecords.delete',
    resourceType: 'productRecord',
    resourceId: request.productRecordId,
    sourceDeletionRequestId: args.deletionRequestId,
    createdAt: now,
  })
}

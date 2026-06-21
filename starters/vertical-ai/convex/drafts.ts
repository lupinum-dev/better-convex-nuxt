import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireOrgAccess } from './access'

export const createFromAgent = mutation({
  args: {
    organizationId: v.id('organizations'),
    title: v.string(),
    body: v.string(),
    sourceThreadId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const title = args.title.trim()
    const body = args.body.trim()
    if (!title || !body) {
      throw new ConvexError('Draft title and body are required')
    }

    return await ctx.db.insert('drafts', {
      organizationId: args.organizationId,
      title,
      body,
      source: 'agent',
      sourceThreadId: args.sourceThreadId,
      status: 'pending',
      createdAt: Date.now()
    })
  }
})

export const listPending = query({
  args: {
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.organizationId, 'reviewer')
    return await ctx.db
      .query('drafts')
      .withIndex('by_org_status', (q: any) =>
        q.eq('organizationId', args.organizationId).eq('status', 'pending')
      )
      .order('desc')
      .collect()
  }
})

import { v } from 'convex/values'

import { action, mutation, query } from './_generated/server'
import { canonicalConvexJson, digestConvexValue } from './canonical_convex'

const TOKEN_ISSUER = 'https://auth.example.test/'

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [
      'members',
      'notes',
      'renameReceipts',
      'reportReceipts',
      'workspaces',
    ] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id)
    }
    await ctx.db.insert('members', {
      issuer: TOKEN_ISSUER,
      role: 'owner',
      status: 'active',
      subject: 'alice',
      tenantId: 'tenant-a',
    })
    await ctx.db.insert('members', {
      issuer: TOKEN_ISSUER,
      role: 'editor',
      status: 'active',
      subject: 'bob',
      tenantId: 'tenant-b',
    })
    await ctx.db.insert('workspaces', {
      externalId: 'workspace-a',
      revision: 1,
      tenantId: 'tenant-a',
    })
    await ctx.db.insert('workspaces', {
      externalId: 'workspace-b',
      revision: 1,
      tenantId: 'tenant-b',
    })
    await ctx.db.insert('notes', {
      externalId: 'note-a',
      revision: 1,
      title: 'Alpha',
      workspaceExternalId: 'workspace-a',
    })
    await ctx.db.insert('notes', {
      externalId: 'note-b',
      revision: 1,
      title: 'Beta',
      workspaceExternalId: 'workspace-b',
    })
    return { seeded: true }
  },
})

export const setMemberStatus = mutation({
  args: { status: v.union(v.literal('active'), v.literal('removed')), subject: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query('members')
      .withIndex('by_issuer_subject', (query) =>
        query.eq('issuer', TOKEN_ISSUER).eq('subject', args.subject),
      )
      .unique()
    if (!member) throw new Error('MEMBER_NOT_FOUND')
    await ctx.db.patch(member._id, { status: args.status })
    return { status: args.status, subject: args.subject }
  },
})

export const inspect = query({
  args: {},
  handler: async (ctx) => {
    const note = await ctx.db
      .query('notes')
      .withIndex('by_external_id', (query) => query.eq('externalId', 'note-a'))
      .unique()
    return {
      note: note ? { revision: note.revision, title: note.title } : null,
      renameReceipts: (await ctx.db.query('renameReceipts').collect()).length,
      reportReceipts: (await ctx.db.query('reportReceipts').collect()).length,
    }
  },
})

export const canonicalDigest = action({
  args: { value: v.any() },
  handler: async (_ctx, args) => ({
    digest: await digestConvexValue(args.value),
    json: canonicalConvexJson(args.value),
  }),
})

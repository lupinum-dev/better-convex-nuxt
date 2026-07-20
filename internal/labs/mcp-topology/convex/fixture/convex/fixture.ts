import { v } from 'convex/values'

import { mutation } from './_generated/server'

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ['members', 'notes', 'renameReceipts', 'workspaces'] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id)
    }

    await ctx.db.insert('members', {
      role: 'owner',
      status: 'active',
      subject: 'alice',
      tenantId: 'tenant-a',
    })
    await ctx.db.insert('members', {
      role: 'editor',
      status: 'active',
      subject: 'bob',
      tenantId: 'tenant-b',
    })
    await ctx.db.insert('workspaces', {
      externalId: 'workspace-a',
      name: 'Workspace A',
      revision: 1,
      tenantId: 'tenant-a',
    })
    await ctx.db.insert('workspaces', {
      externalId: 'workspace-b',
      name: 'Workspace B',
      revision: 1,
      tenantId: 'tenant-b',
    })
    await ctx.db.insert('notes', {
      body: 'Alpha body',
      externalId: 'note-a',
      revision: 1,
      title: 'Alpha',
      workspaceExternalId: 'workspace-a',
    })
    await ctx.db.insert('notes', {
      body: 'Beta body',
      externalId: 'note-b',
      revision: 1,
      title: 'Beta',
      workspaceExternalId: 'workspace-b',
    })

    return { seeded: true }
  },
})

export const setMember = mutation({
  args: {
    role: v.union(v.literal('editor'), v.literal('owner')),
    status: v.union(v.literal('active'), v.literal('removed')),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query('members')
      .withIndex('by_subject_tenant', (query) => query.eq('subject', args.subject))
      .collect()
    if (members.length !== 1) throw new Error('LAB_MEMBER_NOT_UNIQUE')
    await ctx.db.patch(members[0]!._id, { role: args.role, status: args.status })
    return { role: args.role, status: args.status, subject: args.subject }
  },
})

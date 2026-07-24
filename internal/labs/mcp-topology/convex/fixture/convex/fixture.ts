import { v } from 'convex/values'

import { action, mutation, query } from './_generated/server'
import { internal } from './_generated/api'

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [
      'members',
      'notes',
      'renameReceipts',
      'workspaceDeletionInteractions',
      'workspaces',
    ] as const) {
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
    await ctx.db.patch(members[0]!._id, {
      role: args.role,
      status: args.status,
    })
    return { role: args.role, status: args.status, subject: args.subject }
  },
})

export const addNoteForTest = mutation({
  args: {
    externalId: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('notes', {
      body: 'Added after interaction preparation',
      externalId: args.externalId,
      revision: 1,
      title: 'Added later',
      workspaceExternalId: args.workspaceId,
    })
    return { externalId: args.externalId, workspaceId: args.workspaceId }
  },
})

export const expireWorkspaceDeletionForTest = mutation({
  args: {
    locator: v.string(),
  },
  handler: async (ctx, args) => {
    const interaction = await ctx.db
      .query('workspaceDeletionInteractions')
      .withIndex('by_locator', (query) => query.eq('locator', args.locator))
      .unique()
    if (!interaction) throw new Error('LAB_INTERACTION_NOT_FOUND')
    await ctx.db.patch(interaction._id, { expiresAt: Date.now() - 1 })
    return { expired: true }
  },
})

export const countWorkspaceDeletionInteractionsForTest = query({
  args: {},
  handler: async (ctx) => ({
    count: (await ctx.db.query('workspaceDeletionInteractions').take(2)).length,
  }),
})

const testAccess = v.object({
  clientId: v.string(),
  issuer: v.string(),
  resource: v.string(),
  subject: v.string(),
})
const testBrowserActor = v.object({
  issuer: v.string(),
  subject: v.string(),
})

export const prepareWorkspaceDeletionForTest = action({
  args: {
    access: testAccess,
    workspaceId: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> =>
    await ctx.runMutation(internal.operations.prepareWorkspaceDeletion, {
      ...args,
      locator: crypto.randomUUID(),
      operationKey: crypto.randomUUID(),
    }),
})

export const getWorkspaceDeletionStatusForTest = action({
  args: {
    access: testAccess,
    operationKey: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> =>
    await ctx.runQuery(internal.operations.getWorkspaceDeletionStatus, args),
})

export const getWorkspaceDeletionReviewForTest = action({
  args: {
    actor: testBrowserActor,
    locator: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> =>
    await ctx.runQuery(internal.operations.getWorkspaceDeletionReview, args),
})

export const confirmWorkspaceDeletionForTest = action({
  args: {
    actor: testBrowserActor,
    locator: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> =>
    await ctx.runMutation(internal.operations.confirmWorkspaceDeletion, args),
})

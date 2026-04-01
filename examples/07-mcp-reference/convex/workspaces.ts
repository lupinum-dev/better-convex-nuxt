import { can, deny } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateRunbook, canManageMcpKeys, canReadWorkspaceRunbook } from './auth/checks'

const joinRoleValidator = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    // DEMO ONLY: onboarding stays easier when example users can discover seedable workspaces.
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const getPermissionContext = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user) return null

    const actor = await getActor(ctx)

    return {
      role: user.role,
      userId: user.authId,
      tenantId: user.workspaceId ?? null,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      can: {
        'runbook.read': actor ? can(actor, canReadWorkspaceRunbook) : false,
        'runbook.create': actor ? can(actor, canCreateRunbook) : false,
        'mcp.manage': actor ? can(actor, canManageMcpKeys) : false,
      },
    }
  },
})

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('That workspace slug is already taken.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user) throw new Error('Current user row not found.')

    const now = Date.now()
    const tenantId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('runbooks', {
      title: 'Public onboarding guide',
      summary: 'A public runbook that demonstrates the unauthenticated MCP surface.',
      content: [
        '# Public onboarding guide',
        '',
        '- Public tools can list and search this runbook without auth.',
        '- Scoped tools operate on workspace runbooks after MCP key auth succeeds.',
        '- Sessions enable stored preferences and dynamic per-session tools.',
      ].join('\n'),
      visibility: 'public',
      tags: ['public', 'onboarding'],
      ownerId: identity.subject,
      workspaceId: tenantId,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    })

    await ctx.db.insert('runbooks', {
      title: 'Internal incident checklist',
      summary: 'A workspace-only runbook seeded so the authenticated MCP tools have content.',
      content: [
        '# Internal incident checklist',
        '',
        '1. Acknowledge the incident.',
        '2. Assign an owner.',
        '3. Capture current impact and next update time.',
      ].join('\n'),
      visibility: 'workspace',
      tags: ['incident', 'ops'],
      ownerId: identity.subject,
      workspaceId: tenantId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId: tenantId,
      role: 'owner',
      updatedAt: now,
    })

    return tenantId
  },
})

export const joinWorkspace = mutation({
  args: {
    slug: v.string(),
    role: joinRoleValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const workspace = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!workspace) throw new Error('Workspace not found.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user) throw new Error('Current user row not found.')

    await ctx.db.patch(user._id, {
      workspaceId: workspace._id,
      role: args.role,
      updatedAt: Date.now(),
    })

    return workspace._id
  },
})

import { open, requireAuth } from '@lupinum/trellis/auth'

import { createWorkspace } from '../../../shared/features/workspaces/contract'
import { mutation } from '../../functions'

export const createWorkspaceMutation = mutation({
  guard: open,
  args: createWorkspace.args,
  handler: async (ctx, args) => {
    const principal = await ctx.principal()
    // This onboarding path is intentionally principal-gated instead of actor-gated:
    // a signed-in user may exist before they have any workspace-bound actor row.
    requireAuth(principal, 'Forbidden: authRequired')
    if (principal.kind !== 'user') {
      throw new Error('Workspace creation requires a signed-in user principal.')
    }

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('That workspace slug is already taken.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', principal.userId))
      .first()

    if (!user) throw new Error('Current user row not found.')

    const now = Date.now()
    const crossTenantDb = ctx.db.escapeTenantIsolation({
      reason: 'Seed onboarding runbooks before the new workspace is actor-scoped.',
    })
    const tenantId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: principal.userId,
      createdAt: now,
      updatedAt: now,
    })

    // Once the workspace exists, attach the user to it and promote them to owner.
    await ctx.db.patch(user._id, {
      workspaceId: tenantId,
      role: 'owner',
      updatedAt: now,
    })

    // On first-workspace creation there is no tenant-bound actor yet, so seed
    // content must bypass tenant isolation explicitly.
    await crossTenantDb.insert('runbooks', {
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
      ownerId: principal.userId,
      workspaceId: tenantId,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    })

    await crossTenantDb.insert('runbooks', {
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
      ownerId: principal.userId,
      workspaceId: tenantId,
      createdAt: now,
      updatedAt: now,
    })

    return tenantId
  },
})

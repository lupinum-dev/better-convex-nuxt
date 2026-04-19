/**
 * Why this file exists:
 * The webhook route is verified at the Nuxt boundary, but the resulting task still needs a stable
 * app-level owner for audit and ownership semantics. This helper keeps that bot identity
 * workspace-scoped and server-owned.
 */
import type { GenericMutationCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'

type MutationCtx = GenericMutationCtx<DataModel>

export function getWebhookBotAuthId(workspaceId: Id<'workspaces'>): string {
  return `webhook-bot:${workspaceId}`
}

export async function ensureWebhookBotUser(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  now = Date.now(),
): Promise<string> {
  const authId = getWebhookBotAuthId(workspaceId)
  const existing = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()

  if (existing) {
    if (existing.workspaceId !== workspaceId || existing.role !== 'admin') {
      await ctx.db.patch(existing._id, {
        workspaceId,
        role: 'admin',
        updatedAt: now,
      })
    }
    return authId
  }

  await ctx.db.insert('users', {
    authId,
    email: `webhook-bot+${workspaceId}@example.test`,
    displayName: 'Webhook Bot',
    role: 'admin',
    workspaceId,
    createdAt: now,
    updatedAt: now,
  })

  return authId
}

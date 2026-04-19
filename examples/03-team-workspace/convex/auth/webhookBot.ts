/**
 * Why this file exists:
 * Webhook processing still resolves to a real workspace user row so todo ownership stays on the
 * same data model as browser callers without teaching trusted-caller forwarding in this example.
 */
import { deny } from '@lupinum/trellis/auth'
import type { GenericDatabaseReader, GenericMutationCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Actor } from './actor'

type Db = GenericDatabaseReader<DataModel>
type MutationCtx = GenericMutationCtx<DataModel>

export function getWebhookBotAuthId(workspaceId: Id<'workspaces'>): string {
  return `webhook-bot:${workspaceId}`
}

export async function ensureWebhookBotUser(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  now = Date.now(),
): Promise<void> {
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
    return
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
}

async function getWebhookBotUser(db: Db, workspaceId: Id<'workspaces'>) {
  return await db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', getWebhookBotAuthId(workspaceId)))
    .first()
}

export async function resolveWebhookActor(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
): Promise<NonNullable<Actor>> {
  const user = await getWebhookBotUser(ctx.db, workspaceId)
  if (!user?.workspaceId || user.workspaceId !== workspaceId) {
    throw deny('Webhook bot user not configured.')
  }

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
  }
}

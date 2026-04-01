/**
 * Why this file exists:
 * Trusted webhook callers must resolve to a real user row so todo permissions and ownership stay
 * on the same actor model as browser callers.
 */
import { deny } from 'better-convex-nuxt/auth'
import { verifyTrustedCallerKey } from 'better-convex-nuxt/trusted-caller'
import type { GenericDatabaseReader, GenericMutationCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'
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
  } satisfies Doc<'users'>)
}

async function getWebhookBotUser(db: Db, workspaceId: Id<'workspaces'>) {
  return await db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', getWebhookBotAuthId(workspaceId)))
    .first()
}

export async function resolveWebhookActor(
  ctx: MutationCtx,
  key: string,
  workspaceId: Id<'workspaces'>,
): Promise<Actor> {
  const expected = process.env.CONVEX_TRUSTED_CALLER_KEY?.trim()
  if (!expected) {
    throw new Error('CONVEX_TRUSTED_CALLER_KEY must be set for trusted caller example flows.')
  }
  if (!verifyTrustedCallerKey(key, expected)) throw deny('Invalid trusted caller key.')

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

/**
 * Why this file exists:
 * Public links are a second auth path. They need their own validation and must stay typed.
 */
import { deny } from 'better-convex-nuxt/auth'

import type { DatabaseReader } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import type { AccessLevel } from './pageAccess'

export type ShareGrant = {
  kind: 'share_token'
  tokenId: Id<'shareTokens'>
  pageId: Id<'pages'>
  workspaceId: Id<'workspaces'>
  level: AccessLevel
}

export async function resolveShareToken(db: DatabaseReader, token: string): Promise<ShareGrant> {
  const record = await db
    .query('shareTokens')
    .withIndex('by_token', q => q.eq('token', token))
    .first()

  if (!record) throw deny('Invalid share link.')
  if (record.expiresAt && record.expiresAt < Date.now()) throw deny('Link expired.')
  if (record.revokedAt) throw deny('Link has been revoked.')

  return {
    kind: 'share_token',
    tokenId: record._id,
    pageId: record.pageId,
    workspaceId: record.workspaceId,
    level: record.level as AccessLevel,
  }
}

export function requireTokenLevel(grant: ShareGrant, minLevel: AccessLevel): void {
  const levels = { view: 0, comment: 1, edit: 2 }
  if (levels[grant.level] < levels[minLevel]) {
    throw deny(`This link only allows ${grant.level}.`)
  }
}

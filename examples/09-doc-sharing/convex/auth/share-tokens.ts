import { deny } from 'better-convex-nuxt/auth'

import type { DatabaseReader } from '../_generated/server'
import type { AccessLevel } from './page-access'

export type ShareGrant = {
  kind: 'share_token'
  tokenId: string
  pageId: string
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
    level: record.level as AccessLevel,
  }
}

export function requireTokenLevel(grant: ShareGrant, minLevel: AccessLevel): void {
  const levels = { view: 0, comment: 1, edit: 2 }
  if (levels[grant.level] < levels[minLevel]) {
    throw deny(`This link only allows ${grant.level}.`)
  }
}

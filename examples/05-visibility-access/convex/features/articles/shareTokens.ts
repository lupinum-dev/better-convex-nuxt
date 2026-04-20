import { deny } from '@lupinum/trellis/auth'

import type { Id } from '../../_generated/dataModel'
import type { DatabaseReader } from '../../_generated/server'

export type AccessLevel = 'view' | 'comment' | 'edit'

export type ShareGrant = {
  kind: 'share_token'
  tokenId: Id<'shareTokens'>
  articleId: Id<'articles'>
  workspaceId: Id<'workspaces'>
  level: AccessLevel
}

export function createShareTokenValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function shareTokenPrefix(token: string): string {
  return `share_${token.slice(0, 8)}...`
}

export async function hashShareToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function resolveShareToken(db: DatabaseReader, token: string): Promise<ShareGrant> {
  const hash = await hashShareToken(token)
  const record = await db
    .query('shareTokens')
    .withIndex('by_hash', (q) => q.eq('hash', hash))
    .first()

  if (!record) throw deny('Invalid share link.')
  if (record.expiresAt && record.expiresAt < Date.now()) throw deny('Link expired.')
  if (record.revokedAt) throw deny('Link has been revoked.')

  return {
    kind: 'share_token',
    tokenId: record._id,
    articleId: record.articleId,
    workspaceId: record.workspaceId,
    level: record.level as AccessLevel,
  }
}

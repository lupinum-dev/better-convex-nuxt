/**
 * Why this file exists:
 * Row-level visibility for articles. Editors see their team's articles, contributors see only
 * their own, admins see all. Adapted from the CRM pipeline's contact visibility pattern.
 */
import type { DatabaseReader } from '../_generated/server'
import type { Actor } from './actor'

type ArticleOwnerScope = 'all' | Set<string>

export async function getArticleOwnerScope(
  db: DatabaseReader,
  actor: Exclude<Actor, null>,
): Promise<ArticleOwnerScope> {
  if (actor.role === 'owner' || actor.role === 'admin') {
    return 'all'
  }

  if (actor.role === 'editor') {
    const team = await db
      .query('users')
      .withIndex('by_manager', (q) => q.eq('managerId', actor.userId))
      .collect()

    return new Set([actor.userId, ...team.map((user) => user.authId)])
  }

  return new Set([actor.userId])
}

export function canAccessArticleOwner(scope: ArticleOwnerScope, ownerId: string): boolean {
  return scope === 'all' || scope.has(ownerId)
}

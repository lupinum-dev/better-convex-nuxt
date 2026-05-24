import type { Id } from '../../_generated/dataModel'
import type { DatabaseReader } from '../../_generated/server'
import type { AppIdentity } from '../../auth/appIdentity'

type ArticleOwnerScope = 'all' | Set<Id<'users'>>

export async function getArticleOwnerScope(
  db: DatabaseReader,
  appIdentity: Exclude<AppIdentity, null>,
): Promise<ArticleOwnerScope> {
  if (appIdentity.role === 'owner' || appIdentity.role === 'admin') {
    return 'all'
  }

  if (appIdentity.role === 'editor') {
    const team = await db
      .query('users')
      .withIndex('by_manager', (q) => q.eq('managerId', appIdentity.userId))
      .collect()

    return new Set([appIdentity.userId, ...team.map((user) => user._id)])
  }

  return new Set([appIdentity.userId])
}

export function canAccessArticleOwner(scope: ArticleOwnerScope, ownerId: Id<'users'>): boolean {
  return scope === 'all' || scope.has(ownerId)
}

import type { DatabaseReader } from '../../_generated/server'
import type { AppIdentity } from '../../auth/appIdentity'

type ArticleOwnerScope = 'all' | Set<string>

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

    return new Set([appIdentity.userId, ...team.map((user) => user.authId)])
  }

  return new Set([appIdentity.userId])
}

export function canAccessArticleOwner(scope: ArticleOwnerScope, ownerId: string): boolean {
  return scope === 'all' || scope.has(ownerId)
}

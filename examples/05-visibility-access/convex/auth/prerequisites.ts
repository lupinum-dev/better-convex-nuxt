/**
 * Why this file exists:
 * Article prerequisite chains ensure readers complete foundational content first.
 */
import { deny } from '@lupinum/trellis/auth'

import type { Doc } from '../_generated/dataModel'
import type { DatabaseReader } from '../_generated/server'

export async function ensurePrerequisites(
  db: DatabaseReader,
  userId: string,
  article: Doc<'articles'>,
): Promise<void> {
  for (const prerequisiteId of article.prerequisiteIds ?? []) {
    const progress = await db
      .query('articleProgress')
      .withIndex('by_user_article', (q) => q.eq('userId', userId).eq('articleId', prerequisiteId))
      .first()

    if (!progress?.completedAt) {
      const prerequisite = await db.get(prerequisiteId)
      throw deny(`Complete "${prerequisite?.title ?? 'previous article'}" first.`)
    }
  }
}

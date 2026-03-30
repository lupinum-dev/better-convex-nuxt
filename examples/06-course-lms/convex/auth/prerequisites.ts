import { deny } from 'better-convex-nuxt/auth'

import type { DatabaseReader } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'

export async function ensurePrerequisites(
  db: DatabaseReader,
  userId: string,
  lesson: Doc<'lessons'>,
): Promise<void> {
  for (const prerequisiteId of lesson.prerequisiteIds ?? []) {
    const progress = await db
      .query('lessonProgress')
      .withIndex('by_user_lesson', q => q.eq('userId', userId).eq('lessonId', prerequisiteId))
      .first()

    if (!progress?.completedAt) {
      const prerequisite = await db.get(prerequisiteId)
      throw deny(`Complete "${prerequisite?.title ?? 'previous lesson'}" first.`)
    }
  }
}

import { deny } from 'better-convex-nuxt/auth'

import type { DatabaseReader } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import type { Actor } from './actor'
import { canReadLesson, hasRole } from './checks'

export async function requireEnrollment(
  db: DatabaseReader,
  actor: Actor,
  courseId: Id<'courses'>,
): Promise<Doc<'enrollments'>> {
  if (!actor) throw deny('Not authenticated.')

  if (hasRole('owner', 'admin', 'instructor')(actor) && canReadLesson(actor)) {
    return {
      userId: actor.userId,
      courseId,
      status: 'active',
      createdAt: 0,
      workspaceId: actor.tenantId,
    } as Doc<'enrollments'>
  }

  const enrollment = await db
    .query('enrollments')
    .withIndex('by_user_course', q => q.eq('userId', actor.userId).eq('courseId', courseId))
    .first()

  if (!enrollment || enrollment.status !== 'active') {
    throw deny('Not enrolled in this course.')
  }

  return enrollment
}

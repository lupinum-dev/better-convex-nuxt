import { deny } from 'better-convex-nuxt/auth'

import type { Doc } from '../_generated/dataModel'
import type { DatabaseReader } from '../_generated/server'
import type { Actor } from './actor'
import { isStaffActor, requireEnrollment } from './enrollment'
import { ensurePrerequisites } from './prerequisites'
import { requireRecord } from './scope'

export async function requireLessonAccess(
  db: DatabaseReader,
  actor: Exclude<Actor, null>,
  lesson: Doc<'lessons'>,
): Promise<{ course: Doc<'courses'>; enrollment: Doc<'enrollments'> | null }> {
  const course = await db.get(lesson.courseId)
  requireRecord(course, 'Course')

  if (isStaffActor(actor)) {
    return { course, enrollment: null }
  }

  if (course.status !== 'published') throw deny('Course not available.')
  if (lesson.status !== 'published') throw deny('Lesson not available.')

  const enrollment = await requireEnrollment(db, actor, course._id)
  await ensurePrerequisites(db, actor.userId, lesson)

  if (lesson.availableAfter && lesson.availableAfter > Date.now()) {
    throw deny('This lesson is not available yet.')
  }

  return { course, enrollment }
}

/**
 * Why this file exists:
 * LMS authorization depends on the enrollment relationship, not just the user's role.
 */
import { deny } from 'better-convex-nuxt/auth'

import type { Doc, Id } from '../_generated/dataModel'
import type { DatabaseReader } from '../_generated/server'
import type { Actor } from './actor'
import { hasRole } from './checks'

export function isStaffActor(actor: Actor): actor is Exclude<Actor, null> {
  return !!actor && hasRole('owner', 'admin', 'instructor')(actor)
}

export async function requireEnrollment(
  db: DatabaseReader,
  actor: Actor,
  courseId: Id<'courses'>,
): Promise<Doc<'enrollments'>> {
  if (!actor) throw deny('Not authenticated.')

  const enrollment = await db
    .query('enrollments')
    .withIndex('by_user_course', (q) => q.eq('userId', actor.userId).eq('courseId', courseId))
    .first()

  if (!enrollment || enrollment.status !== 'active') {
    throw deny('Not enrolled in this course.')
  }

  return enrollment
}

/**
 * Why this file exists:
 * Knowledge base access depends on enrollment, not just the user's workspace role.
 */
import { deny } from '@lupinum/trellis/auth'

import type { Doc, Id } from '../_generated/dataModel'
import type { DatabaseReader } from '../_generated/server'
import type { Actor } from './actor'
import { isStaffActor } from './checks'

export { isStaffActor }

export async function requireEnrollment(
  db: DatabaseReader,
  actor: Actor,
  knowledgeBaseId: Id<'knowledgeBases'>,
): Promise<Doc<'enrollments'>> {
  if (!actor) throw deny('Not authenticated.')

  const enrollment = await db
    .query('enrollments')
    .withIndex('by_user_kb', (q) =>
      q.eq('userId', actor.userId).eq('knowledgeBaseId', knowledgeBaseId),
    )
    .first()

  if (!enrollment || enrollment.status !== 'active') {
    throw deny('Not enrolled in this knowledge base.')
  }

  return enrollment
}

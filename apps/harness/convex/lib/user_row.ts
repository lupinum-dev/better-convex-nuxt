import type { GenericDatabaseReader } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { Actor } from '../auth/actor'

export async function getUserRowFromActor(
  db: GenericDatabaseReader<DataModel>,
  actor: Actor,
) {
  if (!actor) return null

  return await db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
    .first()
}

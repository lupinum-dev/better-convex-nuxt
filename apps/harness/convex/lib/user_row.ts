import type { GenericDatabaseReader } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { AppIdentity } from '../auth/app-identity'

export async function getUserRowFromActor(
  db: GenericDatabaseReader<DataModel>,
  appIdentity: AppIdentity,
) {
  if (!appIdentity) return null

  return await db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', appIdentity.userId))
    .first()
}

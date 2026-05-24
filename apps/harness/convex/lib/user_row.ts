import type { GenericDatabaseReader } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { AppIdentity } from '../auth/appIdentity'

export async function getUserRowFromActor(
  db: GenericDatabaseReader<DataModel>,
  appIdentity: AppIdentity,
) {
  if (!appIdentity) return null

  return await db.get(appIdentity.userId)
}

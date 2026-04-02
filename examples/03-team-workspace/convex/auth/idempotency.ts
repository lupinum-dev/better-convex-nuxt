/**
 * Why this file exists:
 * External systems retry, so webhook-side authorization also needs replay protection.
 */
import { deny } from '@lupinum/trellis/auth'
import type { GenericMutationCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

type Db = GenericMutationCtx<DataModel>['db']

export async function ensureNotProcessed(db: Db, source: string, eventId: string): Promise<void> {
  const existing = await db
    .query('processedEvents')
    .withIndex('by_source_event_id', (q) => q.eq('source', source).eq('eventId', eventId))
    .first()

  if (existing) throw deny('Event already processed.')
}

export async function markProcessed(db: Db, eventId: string, source: string): Promise<void> {
  await db.insert('processedEvents', {
    eventId,
    source,
    processedAt: Date.now(),
  })
}

import { deny } from 'better-convex-nuxt/auth'

export async function ensureNotProcessed(db: any, eventId: string): Promise<void> {
  const existing = await db
    .query('processedEvents')
    .withIndex('by_event_id', (q: any) => q.eq('eventId', eventId))
    .first()

  if (existing) throw deny('Event already processed.')
}

export async function markProcessed(db: any, eventId: string, source: string): Promise<void> {
  await db.insert('processedEvents', {
    eventId,
    source,
    processedAt: Date.now(),
  })
}

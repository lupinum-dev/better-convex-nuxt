import { deny, requireRecord } from '@lupinum/trellis/auth'

export { requireRecord }

export function loadOwnedResource<T extends { ownerId: string }>(
  actor: { userId: string },
  doc: T | null | undefined,
  label = 'Resource',
): T {
  requireRecord(doc, label)
  if (doc.ownerId !== actor.userId) {
    throw deny(`${label} not found.`)
  }
  return doc
}

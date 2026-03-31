import { deny, requireRecord } from 'better-convex-nuxt/auth'

export { requireRecord }

export function loadOwnedResource<T extends { userId: string }>(
  actor: { userId: string },
  doc: T | null | undefined,
  label = 'Resource',
): T {
  requireRecord(doc, label)
  if (doc.userId !== actor.userId) {
    throw deny(`${label} not found.`)
  }
  return doc
}

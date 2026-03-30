import { deny, ensureFound } from 'better-convex-nuxt/auth'

export { ensureFound }

export function loadOwnedResource<T extends { userId: string }>(
  actor: { userId: string },
  doc: T | null | undefined,
  label = 'Resource',
): T {
  ensureFound(doc, label)
  if (doc.userId !== actor.userId) {
    throw deny(`${label} not found.`)
  }
  return doc
}

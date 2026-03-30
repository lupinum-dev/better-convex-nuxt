export function ensureFound<T>(
  doc: T | null | undefined,
  label = 'Resource',
): asserts doc is T {
  if (!doc) throw new Error(`${label} not found.`)
}

export function loadOwnedResource<T extends { userId: string }>(
  actor: { userId: string },
  doc: T | null | undefined,
  label = 'Resource',
): T {
  ensureFound(doc, label)
  if (doc.userId !== actor.userId) {
    throw new Error(`${label} not found.`)
  }
  return doc
}

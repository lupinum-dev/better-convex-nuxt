import { deny, requireAuth, requireRecord } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export { requireRecord }

export function ensureTenant(actor: Actor, resource: { organizationId: string }): void {
  requireAuth(actor)
  if (!actor.tenantId || actor.tenantId !== resource.organizationId) {
    deny('Resource not found.')
  }
}

export function loadResource<T extends { organizationId: string }>(
  actor: Actor,
  doc: T | null | undefined,
  label = 'Resource',
): T {
  requireRecord(doc, label)
  ensureTenant(actor, doc)
  return doc
}

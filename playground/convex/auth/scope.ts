import { deny, ensureFound, requirePrincipal } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export { ensureFound }

export function ensureTenant(actor: Actor, resource: { organizationId: string }): void {
  requirePrincipal(actor)
  if (!actor.tenantId || actor.tenantId !== resource.organizationId) {
    deny('Resource not found.')
  }
}

export function loadResource<T extends { organizationId: string }>(
  actor: Actor,
  doc: T | null | undefined,
  label = 'Resource',
): T {
  ensureFound(doc, label)
  ensureTenant(actor, doc)
  return doc
}

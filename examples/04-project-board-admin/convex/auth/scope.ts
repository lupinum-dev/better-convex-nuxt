import { deny, requireAuth, requireRecord } from 'better-convex-nuxt/auth'

import type { Id } from '../_generated/dataModel'
import type { Actor } from './actor'

export { requireRecord }

export function ensureTenant(
  actor: Actor,
  resource: { workspaceId: Id<'workspaces'> },
): void {
  requireAuth(actor)
  if (actor.tenantId !== resource.workspaceId) {
    throw deny('Resource not found.')
  }
}

export function loadResource<T extends { workspaceId: Id<'workspaces'> }>(
  actor: Actor,
  doc: T | null | undefined,
  label = 'Resource',
): T {
  requireRecord(doc, label)
  ensureTenant(actor, doc)
  return doc
}

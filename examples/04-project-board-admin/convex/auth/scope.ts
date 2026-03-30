import { deny } from 'better-convex-nuxt/auth'

import type { Actor } from './principal'

export function ensureTenant(
  actor: Actor,
  resource: { workspaceId: string },
): void {
  if (!actor) throw deny('Not authenticated.')
  if (actor.tenantId !== resource.workspaceId) {
    throw deny('Resource not found.')
  }
}

export function ensureFound<T>(
  doc: T | null | undefined,
  label = 'Resource',
): asserts doc is T {
  if (!doc) throw new Error(`${label} not found.`)
}

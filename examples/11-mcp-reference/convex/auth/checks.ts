import { and, or } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const hasRole =
  (...roles: string[]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  !!actor && actor.userId === resource.ownerId

export const canCreateRunbook = hasRole('owner', 'admin', 'member')
export const canReadWorkspaceRunbook = hasRole('owner', 'admin', 'member', 'viewer')
export const canUpdateRunbook = (runbook: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(runbook)))
export const canDeleteRunbook = (runbook: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(runbook)))
export const canPublishRunbook = hasRole('owner', 'admin')
export const canManageMcpKeys = hasRole('owner', 'admin')

export function canIssueKeyRole(actor: Actor, role: string): boolean {
  if (!actor) return false
  if (actor.role === 'owner') return ['owner', 'admin', 'member', 'viewer'].includes(role)
  if (actor.role === 'admin') return ['member', 'viewer'].includes(role)
  return false
}

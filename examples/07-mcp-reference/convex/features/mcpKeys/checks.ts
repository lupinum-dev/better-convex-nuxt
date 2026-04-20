import type { Actor } from '../../auth/actor'
import type { Role } from '../../auth/principal'

export function canIssueKeyRole(actor: Actor, role: Role): boolean {
  if (!actor) return false
  if (actor.role === 'owner') return ['owner', 'admin', 'member', 'viewer'].includes(role)
  if (actor.role === 'admin') return ['member', 'viewer'].includes(role)
  return false
}

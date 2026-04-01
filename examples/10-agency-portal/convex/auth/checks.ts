/**
 * Check style:
 * The agency example only needs direct actor predicates because the membership row is already the
 * authoritative authorization grant.
 */
import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const hasRole =
  (...roles: Doc<'memberships'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)

/**
 * Check style:
 * This example mostly uses direct actor predicates. Page-specific access is resolved in the
 * page-access helper because it depends on shares, inheritance, and token grants.
 */
import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const canCreatePage = hasRole('owner', 'admin', 'member')

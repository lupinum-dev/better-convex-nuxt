/**
 * Check style:
 * Direct exports are static actor predicates. This example does not bind resource-owned checks
 * because order access is role-based.
 */
import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)

export const canReadOrders = hasRole('owner', 'admin', 'support', 'viewer')
export const canRefundOrders = hasRole('owner', 'admin')

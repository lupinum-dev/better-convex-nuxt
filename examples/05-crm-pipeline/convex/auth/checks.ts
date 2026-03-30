import { and, or } from 'better-convex-nuxt/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) =>
  (actor: Actor) => !!actor && actor.kind === 'user' && resource.ownerId === actor.userId

export const canReadContacts = hasRole('owner', 'admin', 'manager', 'rep')
export const canCreateContact = hasRole('owner', 'admin', 'manager', 'rep')
export const canUpdateContact = (contact: Doc<'contacts'>) =>
  or(hasRole('owner', 'admin', 'manager'), and(hasRole('rep'), isOwnerOf(contact)))

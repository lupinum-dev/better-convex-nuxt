/**
 * Why this file exists:
 * Static predicates for role and ownership checks across the knowledge base domain.
 */
import { and, or } from 'better-convex-nuxt/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)

export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  !!actor && actor.userId === resource.ownerId

export const isStaffActor = (actor: Actor): actor is Exclude<Actor, null> =>
  !!actor && hasRole('owner', 'admin', 'editor')(actor)

export const canCreateKB = hasRole('owner', 'admin')
export const canReadKB = hasRole('owner', 'admin', 'editor', 'contributor', 'viewer')

export const canCreateArticle = hasRole('owner', 'admin', 'editor', 'contributor')
export const canReadArticle = hasRole('owner', 'admin', 'editor', 'contributor', 'viewer')

export const canUpdateArticle = (article: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('editor', 'contributor'), isOwnerOf(article)))

export const canManageEnrollments = hasRole('owner', 'admin', 'editor')
export const canCreateShareToken = hasRole('owner', 'admin', 'editor')

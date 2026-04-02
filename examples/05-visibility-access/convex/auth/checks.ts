/**
 * Why this file exists:
 * Static predicates for role and ownership checks across the knowledge base domain.
 */
import { defineGuard } from '@lupinum/trellis/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const hasRole = (...roles: Doc<'users'>['role'][]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => !!actor && roles.includes(actor.role))

export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<Actor>(
    `owner:${resource.ownerId}`,
    (actor) => !!actor && actor.userId === resource.ownerId,
  )

export const isStaffActor = (actor: Actor): actor is Exclude<Actor, null> =>
  !!actor && hasRole('owner', 'admin', 'editor')(actor)

export const canCreateKB = defineGuard<Actor>(
  'Create knowledge base',
  hasRole('owner', 'admin', 'editor'),
)
export const canReadKB = defineGuard<Actor>(
  'Read knowledge base',
  hasRole('owner', 'admin', 'editor', 'contributor', 'viewer'),
)

export const canCreateArticle = defineGuard<Actor>(
  'Create article',
  hasRole('owner', 'admin', 'editor', 'contributor'),
)
export const canReadArticle = defineGuard<Actor>(
  'Read articles',
  hasRole('owner', 'admin', 'editor', 'contributor', 'viewer'),
)

export const canUpdateArticle = (article: { ownerId: string }) =>
  defineGuard<Actor>(
    'Update article',
    hasRole('owner', 'admin').or(hasRole('editor', 'contributor').and(isOwnerOf(article))),
  )

export const canManageEnrollments = defineGuard<Actor>(
  'Manage enrollments',
  hasRole('owner', 'admin', 'editor'),
)
export const canCreateShareToken = defineGuard<Actor>(
  'Create share token',
  hasRole('owner', 'admin', 'editor'),
)

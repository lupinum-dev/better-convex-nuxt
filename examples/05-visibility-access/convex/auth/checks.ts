/**
 * Why this file exists:
 * Reusable predicates and record-bound checks for the knowledge base domain. Static named
 * permissions live in permissions.ts.
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

export const isStaffActor = (actor: Actor): boolean => hasRole('owner', 'admin', 'editor')(actor)

export const canUpdateArticle = (article: { ownerId: string }) =>
  defineGuard<Actor>(
    'Update article',
    hasRole('owner', 'admin').or(hasRole('editor', 'contributor').and(isOwnerOf(article))),
  )

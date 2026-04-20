import { defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from './actor'

export const isAuthenticated = defineGuard<Actor>('authenticated', (actor) => actor !== null)

export const hasRole = (...roles: string[]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) =>
    !!actor && roles.includes(actor.role),
  )

export const isOwnerOfPage = (page: { authorId: string }) =>
  defineGuard<Actor>(`owner:${page.authorId}`, (actor) => !!actor && actor.userId === page.authorId)

export const canEditPage = (page: { authorId: string }) =>
  defineGuard<Actor>(
    'page.edit',
    isAuthenticated.and(hasRole('admin').or(isOwnerOfPage(page))),
  )

export const canPublishPage = (page: { authorId: string }) =>
  defineGuard<Actor>(
    'page.publish',
    isAuthenticated.and(hasRole('admin').or(isOwnerOfPage(page))),
  )

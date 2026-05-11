import { defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from './actor'

export const isAuthenticated = defineGuard<Actor>('authenticated', (actor) => actor !== null)

export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<Actor>(
    `owner:${resource.ownerId}`,
    (actor) => !!actor && actor.kind === 'user' && actor.userId === resource.ownerId,
  )

import { defineGuard } from '@lupinum/trellis/auth'

import type { AppIdentity } from './appIdentity'

export const isAuthenticated = defineGuard<AppIdentity>(
  'authenticated',
  (appIdentity) => appIdentity !== null,
)

export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<AppIdentity>(
    `owner:${resource.ownerId}`,
    (appIdentity) =>
      !!appIdentity && appIdentity.kind === 'user' && appIdentity.userId === resource.ownerId,
  )

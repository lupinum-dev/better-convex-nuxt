import { authenticated, defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from './actor'

export const hasWorkspace = defineGuard<Actor>('Workspace member', (actor) => !!actor?.tenantId)
export const hasRole = (...roles: Actor['role'][]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => !!actor && roles.includes(actor.role))

export const canReadWorkspaceBoard = defineGuard<Actor>(
  'Read board',
  hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
)

export const canCreateCards = defineGuard<Actor>(
  'Create card',
  hasWorkspace.and(hasRole('owner', 'admin', 'member')),
)

export const canMoveCards = defineGuard<Actor>(
  'Move card',
  hasWorkspace.and(hasRole('owner', 'admin', 'member')),
)

export const canArchiveBoard = defineGuard<Actor>(
  'Archive board',
  hasWorkspace.and(hasRole('owner', 'admin')),
)

export const canManageWorkspace = authenticated


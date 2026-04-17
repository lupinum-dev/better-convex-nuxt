import { defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from './actor'

export const hasWorkspace = defineGuard<Actor>('Workspace member', (actor) => !!actor?.tenantId)

export const hasRole = (...roles: Actor['role'][]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => !!actor && roles.includes(actor.role))

export const canReadWorkspace = defineGuard<Actor>(
  'Read workspace',
  hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
)

export const canManageMembers = defineGuard<Actor>(
  'Manage members',
  hasWorkspace.and(hasRole('owner', 'admin')),
)

export const canManageBoards = defineGuard<Actor>(
  'Manage boards',
  hasWorkspace.and(hasRole('owner', 'admin')),
)

export const canManageBoardStructure = defineGuard<Actor>(
  'Manage board structure',
  hasWorkspace.and(hasRole('owner', 'admin')),
)

export const canWriteCards = defineGuard<Actor>(
  'Write cards',
  hasWorkspace.and(hasRole('owner', 'admin', 'member')),
)

export const canArchiveBoard = defineGuard<Actor>(
  'Archive board',
  hasWorkspace.and(hasRole('owner', 'admin')),
)

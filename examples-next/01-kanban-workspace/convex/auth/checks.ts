import { defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from './actor'
import { roleHasPermission } from '../../shared/permissions'

export const hasWorkspace = defineGuard<Actor>('Workspace member', (actor) => !!actor?.tenantId)

export const canReadWorkspace = defineGuard<Actor>(
  'Read workspace',
  hasWorkspace.and(defineGuard<Actor>('perm:readWorkspace', (actor) => roleHasPermission(actor?.role ?? null, 'readWorkspace'))),
)

export const canManageMembers = defineGuard<Actor>(
  'Manage members',
  hasWorkspace.and(defineGuard<Actor>('perm:manageMembers', (actor) => roleHasPermission(actor?.role ?? null, 'manageMembers'))),
)

export const canManageBoards = defineGuard<Actor>(
  'Manage boards',
  hasWorkspace.and(defineGuard<Actor>('perm:manageBoards', (actor) => roleHasPermission(actor?.role ?? null, 'manageBoards'))),
)

export const canManageBoardStructure = defineGuard<Actor>(
  'Manage board structure',
  hasWorkspace.and(
    defineGuard<Actor>('perm:manageBoardStructure', (actor) =>
      roleHasPermission(actor?.role ?? null, 'manageBoardStructure'),
    ),
  ),
)

export const canWriteCards = defineGuard<Actor>(
  'Write cards',
  hasWorkspace.and(defineGuard<Actor>('perm:writeCards', (actor) => roleHasPermission(actor?.role ?? null, 'writeCards'))),
)

export const canArchiveBoard = defineGuard<Actor>(
  'Archive board',
  hasWorkspace.and(defineGuard<Actor>('perm:archiveBoard', (actor) => roleHasPermission(actor?.role ?? null, 'archiveBoard'))),
)

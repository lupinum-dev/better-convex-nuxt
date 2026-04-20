import { defineGuard } from '@lupinum/trellis/auth'

import type { PermissionActor } from '../../auth/actor'
import { hasRole, isOwnerOf } from '../../auth/guards'

export const canUpdateRunbook = (runbook: { ownerId: string }) =>
  defineGuard<PermissionActor>(
    'Update runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )

export const canDeleteRunbook = (runbook: { ownerId: string }) =>
  defineGuard<PermissionActor>(
    'Delete runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )

import { defineGuard } from '@lupinum/trellis/auth'

import type { AccessIdentity } from '../../auth/appIdentity'
import { hasRole, isOwnerOf } from '../../auth/guards'

export const canUpdateRunbook = (runbook: { ownerId: string }) =>
  defineGuard<AccessIdentity>(
    'Update runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )

export const canDeleteRunbook = (runbook: { ownerId: string }) =>
  defineGuard<AccessIdentity>(
    'Delete runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )

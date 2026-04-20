import { definePermission } from '@lupinum/trellis/auth'

import { hasRole } from '../../auth/guards'

export const membershipRead = definePermission({
  key: 'membership.read',
  label: 'Read workspace members',
  roles: ['owner', 'member', 'viewer', 'agency_admin', 'agency_manager'],
  check: hasRole('owner', 'member', 'viewer', 'agency_admin', 'agency_manager'),
})

export const membershipPermissions = [membershipRead] as const

import { definePermission } from '@lupinum/trellis/auth'

import { hasRole } from './checks'

export const postDeletePermission = definePermission({
  key: 'post.delete',
  label: 'Delete post',
  roles: ['owner', 'admin', 'member'],
  check: hasRole('owner', 'admin', 'member'),
})

export const internalHarnessPermissions = [postDeletePermission] as const

export type InternalHarnessPermissionKey = (typeof internalHarnessPermissions)[number]['key']

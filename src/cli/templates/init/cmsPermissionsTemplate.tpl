import { definePermission } from '@lupinum/trellis/auth'

import { isAuthenticated } from './checks'

export const studioRead = definePermission({
  key: 'studio.read',
  check: isAuthenticated,
})

export const pageCreate = definePermission({
  key: 'page.create',
  check: isAuthenticated,
})

export const pagePublish = definePermission({
  key: 'page.publish',
  check: isAuthenticated,
})

export const cmsPermissions = [studioRead, pageCreate, pagePublish] as const

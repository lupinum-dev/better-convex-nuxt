import { definePermission } from '@lupinum/trellis/auth'

import { isAuthenticated } from '../../auth/guards'

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

export const pagePermissions = [studioRead, pageCreate, pagePublish] as const

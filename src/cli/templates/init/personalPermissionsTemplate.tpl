import { definePermission } from '@lupinum/trellis/auth'

import { isAuthenticated } from './checks'

export const profileRead = definePermission({
  key: 'profile.read',
  check: isAuthenticated,
})

export const todoCreate = definePermission({
  key: 'todo.create',
  check: isAuthenticated,
})

export const personalPermissions = [profileRead, todoCreate] as const

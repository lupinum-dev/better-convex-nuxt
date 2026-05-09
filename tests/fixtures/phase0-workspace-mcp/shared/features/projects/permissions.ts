import { definePermissionKey } from '../../../../../../src/runtime/auth'

export const projectDeleteKey = definePermissionKey({
  key: 'projects.delete',
  label: 'Delete projects',
})

import { definePermissionKey } from '../../../../../../src/runtime/auth/define-permission'

export const projectDeleteKey = definePermissionKey({
  key: 'projects.delete',
  label: 'Delete projects',
})

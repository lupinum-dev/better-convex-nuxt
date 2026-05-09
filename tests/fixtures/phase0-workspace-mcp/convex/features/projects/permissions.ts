import { definePermission } from '../../../../../../src/runtime/auth/define-permission'
import { projectDeleteKey } from '../../../shared/features/projects/permissions'

export const projectDelete = definePermission({
  key: projectDeleteKey.key,
  check: true,
})

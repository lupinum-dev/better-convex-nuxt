import { definePermission } from '../../../../../../src/runtime/auth'
import { projectDeleteKey } from '../../../shared/features/projects/permissions'

export const projectDelete = definePermission({
  key: projectDeleteKey.key,
  check: true,
})

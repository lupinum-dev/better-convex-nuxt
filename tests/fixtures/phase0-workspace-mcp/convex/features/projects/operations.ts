import {
  implementOperation,
  operationPreview,
} from '../../../../../../src/runtime/functions/define-operation'
import { deleteProjectDescriptor } from '../../../shared/features/projects/operations'
import { projectDelete } from './permissions'

export const deleteProjectOperation = implementOperation(deleteProjectDescriptor, {
  guard: projectDelete,
  permission: projectDelete,
  preview: async () =>
    operationPreview({
      summary: 'Delete project',
      confirm: {
        id: 'project-1',
      },
    }),
  handler: async () => ({
    deleted: true,
  }),
})

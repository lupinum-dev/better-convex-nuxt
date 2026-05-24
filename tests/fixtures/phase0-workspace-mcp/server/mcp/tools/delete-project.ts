import { executeDeleteProjectRef, previewDeleteProjectRef } from '../../../generated/operation-refs'
import { deleteProjectDescriptor } from '../../../shared/features/projects/operations'
import { tool } from '../runtime'

export default tool.operation(deleteProjectDescriptor, {
  execute: executeDeleteProjectRef,
  preview: previewDeleteProjectRef,
  confirmationMode: 'transport',
})

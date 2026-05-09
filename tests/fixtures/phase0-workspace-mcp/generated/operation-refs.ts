import { projectOperationRef } from '../../../../src/runtime/functions'
import { deleteProjectDescriptor } from '../shared/features/projects/operations'

export const executeDeleteProjectRef = projectOperationRef(
  deleteProjectDescriptor,
  'execute',
  {} as never,
)

export const previewDeleteProjectRef = projectOperationRef(
  deleteProjectDescriptor,
  'preview',
  {} as never,
)

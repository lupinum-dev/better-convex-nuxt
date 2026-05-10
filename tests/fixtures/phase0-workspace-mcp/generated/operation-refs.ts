import { projectOperationRef } from '../../../../src/runtime/functions/define-operation'
import { api } from '../convex/_generated/api'
import { deleteProjectDescriptor } from '../shared/features/projects/operations'

export const executeDeleteProjectRef = projectOperationRef(
  deleteProjectDescriptor,
  'execute',
  api.features.projects.domain.deleteProject,
  { functionRef: 'features/projects/domain:deleteProject' },
)

export const previewDeleteProjectRef = projectOperationRef(
  deleteProjectDescriptor,
  'preview',
  api.features.projects.domain.previewDeleteProject,
  { functionRef: 'features/projects/domain:previewDeleteProject' },
)

import { projectMcpToolRef } from '../../../../src/runtime/mcp/operation-binding'
import { api } from '../convex/_generated/api'
import { createProjectToolDescriptor } from '../shared/features/projects/tools'

export const createProjectRef = projectMcpToolRef(
  createProjectToolDescriptor,
  api.features.projects.domain.createProject,
)

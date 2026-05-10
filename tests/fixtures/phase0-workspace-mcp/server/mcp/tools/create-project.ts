import { createProjectRef } from '../../../generated/mcp-tool-refs'
import {
  createProjectArgs,
  createProjectToolDescriptor,
} from '../../../shared/features/projects/tools'
import { tool } from '../runtime'

export default tool.mutation({
  schema: createProjectArgs,
  call: createProjectRef,
  safety: createProjectToolDescriptor.safety,
  meta: {
    name: createProjectToolDescriptor.name,
  },
})

import { createProjectRef } from '../../../generated/mcp-tool-refs'
import {
  createProjectArgs,
  createProjectToolDescriptor,
} from '../../../shared/features/projects/tools'
import { tool } from '../runtime'

export default tool({
  schema: createProjectArgs,
  call: createProjectRef,
  operation: 'mutation',
  safety: createProjectToolDescriptor.safety,
  meta: {
    name: createProjectToolDescriptor.name,
  },
})

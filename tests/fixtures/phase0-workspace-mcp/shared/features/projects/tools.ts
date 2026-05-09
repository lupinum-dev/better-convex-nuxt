import { v } from 'convex/values'

import { defineArgs } from '../../../../../../src/runtime/convex/shared/define-convex-schema'
import { defineMcpToolRefDescriptor } from '../../../../../../src/runtime/mcp/operation-binding'

export const createProjectArgs = defineArgs({
  description: 'Create a draft project.',
  args: {
    title: v.string(),
  },
})

export const createProjectToolDescriptor = defineMcpToolRefDescriptor({
  name: 'create-project',
  safety: {
    kind: 'bounded-write',
    reason: 'Creates one draft project record named by args.',
  },
})

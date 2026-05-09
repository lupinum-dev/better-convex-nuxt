import { v } from 'convex/values'

import { defineOperationDescriptor } from '../../../../../../src/runtime/functions'
import { projectDeleteKey } from './permissions'

export const deleteProjectDescriptor = defineOperationDescriptor({
  id: 'projects.delete',
  name: 'deleteProject',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  permission: projectDeleteKey,
  safety: 'destructive-write',
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
    }),
    confirm: v.object({
      id: v.string(),
    }),
  }),
  returns: v.object({
    deleted: v.boolean(),
  }),
})

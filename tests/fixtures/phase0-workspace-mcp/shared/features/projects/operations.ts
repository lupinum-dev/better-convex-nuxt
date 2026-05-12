import { v } from 'convex/values'

import {
  defineOperationDescriptor,
  operationPreviewValidator,
} from '../../../../../../src/runtime/functions/define-operation'
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
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      id: v.string(),
    }),
  }),
  returns: v.object({
    deleted: v.boolean(),
  }),
})

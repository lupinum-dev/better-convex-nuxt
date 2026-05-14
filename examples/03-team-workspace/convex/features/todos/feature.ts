import { defineFeature } from '@lupinum/trellis/workspace'

import { removeTodoDescriptor } from './operations'
import { todoPermissions } from './permissions'
import { todoCapabilities } from './recordAccess'
import { todosTables } from './schema'

export const todosFeature = defineFeature({
  name: 'todos',
  schema: todosTables,
  permissions: todoPermissions,
  sharedTables: ['processedEvents'],
  recordAccess: { todos: todoCapabilities },
  operations: [removeTodoDescriptor],
})

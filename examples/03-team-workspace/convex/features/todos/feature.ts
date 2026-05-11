import { defineFeature } from '@lupinum/trellis/workspace'

import { todoCapabilities } from './capabilities'
import { removeTodoDescriptor } from './operations'
import { todoPermissions } from './permissions'
import { todosTables } from './schema'

export const todosFeature = defineFeature({
  name: 'todos',
  schema: todosTables,
  permissions: todoPermissions,
  globalTables: ['processedEvents'],
  capabilities: { todos: todoCapabilities },
  operations: [removeTodoDescriptor],
})

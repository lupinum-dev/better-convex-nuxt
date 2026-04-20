import { defineFeature } from '@lupinum/trellis/feature'

import { todoCapabilities } from './capabilities'
import { removeTodoOp } from './operations'
import { todoPermissions } from './permissions'
import { todosTables } from './schema'

export const todosFeature = defineFeature({
  name: 'todos',
  schema: todosTables,
  permissions: todoPermissions,
  globalTables: ['processedEvents'],
  capabilities: { todos: todoCapabilities },
  operations: [removeTodoOp],
})

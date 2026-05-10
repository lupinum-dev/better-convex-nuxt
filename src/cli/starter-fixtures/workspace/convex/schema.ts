import { defineSchema } from 'convex/server'

import { todosTables } from './features/todos'
import { userTables } from './features/users'
import { workspaceTables } from './features/workspaces'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...todosTables,
})

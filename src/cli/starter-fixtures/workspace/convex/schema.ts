import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { todosTables } from './features/todos'
import { userTables } from './features/users'
import { workspaceTables } from './features/workspaces'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...todosTables,

})

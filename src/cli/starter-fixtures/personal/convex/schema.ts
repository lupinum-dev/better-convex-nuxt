import { defineSchema } from 'convex/server'

import { todosTables } from './features/todos'
import { userTables } from './features/users'

export default defineSchema({
  ...userTables,
  ...todosTables,
})

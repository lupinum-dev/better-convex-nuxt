/**
 * Why this file exists:
 * Convex requires one root schema file, even though the feature modules own the table definitions.
 */
import { defineSchema } from 'convex/server'

import { todosTables } from './features/todos/schema'
import { userTables } from './features/users/schema'

export default defineSchema({
  ...userTables,
  ...todosTables,
})

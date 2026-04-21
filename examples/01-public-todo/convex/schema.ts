/**
 * Why this file exists:
 * Convex requires one root schema file, even though the feature owns the table definition.
 */
import { defineSchema } from 'convex/server'

import { todosTables } from './features/todos/schema'

export default defineSchema({
  ...todosTables,
})

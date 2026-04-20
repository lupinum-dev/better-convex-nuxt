import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { pagesTables } from './features/pages/schema'
import { userTables } from './features/users/schema'

export default defineSchema({
  ...userTables,
  ...pagesTables,
})

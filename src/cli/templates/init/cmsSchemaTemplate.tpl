import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { pagesTables } from './features/pages'
import { userTables } from './features/users'

export default defineSchema({
  ...userTables,
  ...pagesTables,
})

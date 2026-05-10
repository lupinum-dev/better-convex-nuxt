import { defineSchema } from 'convex/server'

import { todosTables } from './features/todos'

export default defineSchema({
  ...todosTables,
})

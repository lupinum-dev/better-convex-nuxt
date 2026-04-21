import { defineSchema } from 'convex/server'

import { pagesTables } from './features/pages/schema'

export default defineSchema({
  ...pagesTables,
})

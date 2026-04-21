import { defineSchema } from 'convex/server'

import { pagesTables } from './features/pages'

export default defineSchema({
  ...pagesTables,
})

import { defineSchema } from 'convex/server'

import { tables as generatedTables } from './generatedSchema'

export const tables = {
  ...generatedTables,
}

export default defineSchema(tables)

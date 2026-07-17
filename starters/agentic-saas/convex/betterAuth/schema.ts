import { defineSchema } from 'convex/server'

import { tables as generatedTables } from './generatedSchema'
import schemaMetadata from './schemaMetadata'

const schema = defineSchema(generatedTables)
Object.defineProperty(schema, '__betterConvexNuxtAuthSchemaFingerprint', {
  value: schemaMetadata.fingerprint,
})

export default schema

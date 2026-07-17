import { defineSchema } from 'convex/server'

import { tables as generatedTables } from './generatedSchema'
import schemaMetadata from './schemaMetadata'

export const tables = {
  ...generatedTables,
  member: generatedTables.member.index('organizationId_userId', ['organizationId', 'userId']),
  invitation: generatedTables.invitation
    .index('email_organizationId_status', ['email', 'organizationId', 'status'])
    .index('organizationId_status', ['organizationId', 'status']),
}

const schema = defineSchema(tables)
Object.defineProperty(schema, '__betterConvexNuxtAuthSchemaFingerprint', {
  value: schemaMetadata.fingerprint,
})

export default schema

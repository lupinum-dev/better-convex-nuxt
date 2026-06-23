import { defineSchema } from 'convex/server'

import { tables as generatedTables } from './generatedSchema'

export const tables = {
  ...generatedTables,
  organizationRole: generatedTables.organizationRole.index('organizationId_role', [
    'organizationId',
    'role',
  ]),
  session: generatedTables.session.index('userId_expiresAt', ['userId', 'expiresAt']),
  member: generatedTables.member.index('organizationId_userId', ['organizationId', 'userId']),
  invitation: generatedTables.invitation
    .index('email_organizationId_status', ['email', 'organizationId', 'status'])
    .index('organizationId_status', ['organizationId', 'status']),
}

export default defineSchema(tables)

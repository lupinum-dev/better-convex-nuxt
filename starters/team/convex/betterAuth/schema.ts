import { defineSchema } from 'convex/server'

import { tables as generatedTables } from './generatedSchema'

export const tables = {
  ...generatedTables,
  organizationRole: generatedTables.organizationRole.index('organizationId_role', [
    'organizationId',
    'role',
  ]),
  session: generatedTables.session.index('userId_expiresAt', ['userId', 'expiresAt']),
  apikey: generatedTables.apikey
    .index('key', ['key'])
    .index('expiresAt', ['expiresAt'])
    .index('referenceId', ['referenceId'])
    .index('configId_referenceId', ['configId', 'referenceId']),
  ...('scimProvider' in generatedTables
    ? {
        scimProvider: generatedTables.scimProvider
          .index('providerId_organizationId', ['providerId', 'organizationId'])
          .index('organizationId_providerId', ['organizationId', 'providerId']),
      }
    : {}),
  ...('deviceCode' in generatedTables
    ? {
        deviceCode: generatedTables.deviceCode
          .index('deviceCode', ['deviceCode'])
          .index('deviceCode_status', ['deviceCode', 'status'])
          .index('userCode', ['userCode'])
          .index('expiresAt', ['expiresAt'])
          .index('status', ['status']),
      }
    : {}),
  ...('subscription' in generatedTables
    ? {
        subscription: generatedTables.subscription
          .index('referenceId', ['referenceId'])
          .index('referenceId_status', ['referenceId', 'status'])
          .index('stripeCustomerId', ['stripeCustomerId'])
          .index('stripeSubscriptionId', ['stripeSubscriptionId']),
      }
    : {}),
  member: generatedTables.member.index('organizationId_userId', ['organizationId', 'userId']),
  teamMember: generatedTables.teamMember.index('teamId_userId', ['teamId', 'userId']),
  invitation: generatedTables.invitation
    .index('email_organizationId_status', ['email', 'organizationId', 'status'])
    .index('organizationId_status', ['organizationId', 'status']),
}

export default defineSchema(tables)

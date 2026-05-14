import { defineTrellis } from '@lupinum/trellis/backend'

import { trellisObservability } from '../observability.config'
import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import type { HarnessDelegation } from './auth/actingFor'
import { actingFor } from './auth/actingFor'
import type { AppIdentity } from './auth/app-identity'
import { getAppIdentityFromCaller } from './auth/app-identity'
import type { InternalHarnessCaller } from './auth/caller'
import { caller } from './auth/caller'

export const { mutation, query, unsafe } = defineTrellis<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessCaller,
  HarnessDelegation,
  AppIdentity
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    caller,
    actingFor,
    appIdentity: getAppIdentityFromCaller,
    isolation: {
      tables: ['posts', 'comments', 'mcpKeys'],
      field: 'organizationId',
    },
    destructiveOperations: {
      confirmationTable: 'destructiveConfirmations' as never,
      auditTable: 'destructiveAuditLog' as never,
    },
    observability: trellisObservability,
  },
)

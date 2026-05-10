import { defineTrellis } from '@lupinum/trellis/backend'

import type { TableNames } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActor } from './auth/actor'
import { globalTables, tenantTables } from './features'

const isolatedTables = [...tenantTables] as TableNames[]
const explicitlyGlobalTables = [...globalTables] as TableNames[]

export const { mutation, query, unsafe } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    actor: getActor,
    tenantIsolation: {
      tables: isolatedTables,
      globalTables: explicitlyGlobalTables,
    },
    destructiveSafety: {
      redemptionTable: 'destructiveRedemptions',
      auditTable: 'destructiveAuditLog',
    },
  },
)

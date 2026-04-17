import { defineTrellis } from '@lupinum/trellis/functions'

import { trellisObservability } from '../observability.config'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { principal } from './auth/principal'

export const { query, mutation, raw } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: ['boards', 'columns', 'cards'],
    },
    destructiveSafety: {
      redemptionTable: 'destructiveRedemptions' as never,
      auditTable: 'destructiveAuditLog' as never,
    },
    observability: trellisObservability,
  },
)

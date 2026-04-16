import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { principal } from './auth/principal'

export const { mutation, query, raw } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: ['runbooks'],
    },
    destructiveSafety: {
      redemptionTable: 'destructiveRedemptions' as never,
      auditTable: 'destructiveAuditLog' as never,
    },
  },
)

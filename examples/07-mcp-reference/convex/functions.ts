import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { delegation } from './auth/delegation'
import { principal } from './auth/principal'
import { services } from './auth/services'

export const { mutation, query, raw } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    delegation,
    actor: getActorFromPrincipal,
    services,
    tenantIsolation: {
      tables: ['runbooks'],
    },
    destructiveSafety: {
      redemptionTable: 'destructiveRedemptions' as never,
      auditTable: 'destructiveAuditLog' as never,
    },
  },
)

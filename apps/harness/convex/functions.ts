import { defineTrellis } from '@lupinum/trellis/backend'

import { trellisObservability } from '../observability.config'
import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import type { Actor } from './auth/actor'
import { getActorFromPrincipal } from './auth/actor'
import type { HarnessDelegation } from './auth/delegation'
import { delegation } from './auth/delegation'
import type { InternalHarnessPrincipal } from './auth/principal'
import { principal } from './auth/principal'

export const { mutation, query, unsafe } = defineTrellis<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessPrincipal,
  HarnessDelegation,
  Actor
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    delegation,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: ['posts', 'comments', 'mcpKeys'],
      field: 'organizationId',
    },
    destructiveSafety: {
      redemptionTable: 'destructiveRedemptions' as never,
      auditTable: 'destructiveAuditLog' as never,
    },
    observability: trellisObservability,
  },
)

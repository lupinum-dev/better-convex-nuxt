import { defineTrellis, type DefineTrellisOptions } from '@lupinum/trellis/functions'

import { trellisObservability } from '../observability.config'
import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal, type Actor } from './auth/actor'
import { principal, type KanbanPrincipal } from './auth/principal'

const trellisOptions = {
  principal,
  actor: getActorFromPrincipal,
  tenantIsolation: {
    tables: ['boards', 'columns', 'cards'],
  },
  destructiveSafety: {
    redemptionTable: 'destructiveRedemptions',
    auditTable: 'destructiveAuditLog',
  },
  observability: trellisObservability,
} satisfies DefineTrellisOptions<DataModel, KanbanPrincipal, Actor>

export const { query, mutation, raw } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  trellisOptions,
)

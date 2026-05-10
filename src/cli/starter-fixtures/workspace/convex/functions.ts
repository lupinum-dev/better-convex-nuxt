import type { TableNames } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { defineTrellis } from '@lupinum/trellis/backend'

import { getActorFromPrincipal } from './auth/actor'
import { principal } from './auth/principal'
import { globalTables, tenantTables } from './features'

const isolatedTables = [...tenantTables] as TableNames[]
const explicitlyGlobalTables = [...globalTables] as TableNames[]

export const { mutation, query } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: isolatedTables,
      globalTables: explicitlyGlobalTables,
    },
  },
)

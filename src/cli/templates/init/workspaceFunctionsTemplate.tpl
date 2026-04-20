import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { delegation } from './auth/principal'
import { principal } from './auth/principal'

export const { mutation, query, unsafe } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    delegation,
    actor: getActorFromPrincipal,
    // Add tenantIsolation only for tables that actually store the tenant field.
    // Example:
    // tenantIsolation: {
    //   tables: ['todos'],
    // },
  },
)

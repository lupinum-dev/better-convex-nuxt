import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { principal } from './auth/principal'

export const { query: trellisQuery, mutation: trellisMutation, publicQuery, publicMutation, raw } =
  defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: ['boards', 'columns', 'cards'],
    },
  },
)

export const query = trellisQuery
export const mutation = trellisMutation

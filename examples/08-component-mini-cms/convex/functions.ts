import { defineTrellis } from '@lupinum/trellis/functions'

import {
  internalMutation as generatedInternalMutation,
  internalQuery as generatedInternalQuery,
  mutation as generatedMutation,
  query as generatedQuery,
} from './_generated/server'
import { getActorFromPrincipal, principal } from './auth/principal'

export const { internalMutation, internalQuery, mutation, query, unsafe } = defineTrellis(
  {
    query: generatedQuery,
    mutation: generatedMutation,
    internalQuery: generatedInternalQuery,
    internalMutation: generatedInternalMutation,
  },
  {
    principal,
    actor: getActorFromPrincipal,
  },
)

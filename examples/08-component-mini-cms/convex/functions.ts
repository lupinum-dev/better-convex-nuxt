import { defineTrellis } from '@lupinum/trellis/backend'

import {
  action as generatedAction,
  internalAction as generatedInternalAction,
  internalMutation as generatedInternalMutation,
  internalQuery as generatedInternalQuery,
  mutation as generatedMutation,
  query as generatedQuery,
} from './_generated/server'
import { getActorFromPrincipal, principal } from './auth/principal'

export const { action, internalAction, internalMutation, internalQuery, mutation, query, unsafe } =
  defineTrellis(
    {
      action: generatedAction,
      internalAction: generatedInternalAction,
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

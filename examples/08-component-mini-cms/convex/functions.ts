import { defineTrellis } from '@lupinum/trellis/backend'

import {
  action as generatedAction,
  internalAction as generatedInternalAction,
  internalMutation as generatedInternalMutation,
  internalQuery as generatedInternalQuery,
  mutation as generatedMutation,
  query as generatedQuery,
} from './_generated/server'
import { getAppIdentityFromCaller, caller } from './auth/caller'

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
      caller,
      appIdentity: getAppIdentityFromCaller,
    },
  )

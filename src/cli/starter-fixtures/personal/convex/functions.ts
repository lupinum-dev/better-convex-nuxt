import { defineTrellis } from '@lupinum/trellis/backend'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getAppIdentity } from './auth/app-identity'

export const { mutation, query } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    appIdentity: getAppIdentity,
  },
)

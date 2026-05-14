import { defineTrellis } from '@lupinum/trellis/backend'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getAppIdentity } from './auth/appIdentity'

export const { mutation, query, unsafe } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    appIdentity: getAppIdentity,
  },
)

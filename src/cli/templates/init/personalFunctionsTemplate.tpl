import { defineTrellis } from '@lupinum/trellis/backend'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActor } from './auth/actor'

export const { mutation, query } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    actor: getActor,
  },
)

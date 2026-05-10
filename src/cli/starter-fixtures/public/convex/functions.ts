import { defineTrellis } from '@lupinum/trellis/backend'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'

export const { mutation, query } = defineTrellis({
  query: generatedQuery,
  mutation: generatedMutation,
})

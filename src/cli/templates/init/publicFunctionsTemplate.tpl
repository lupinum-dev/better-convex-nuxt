import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'

export const { mutation, query } = defineTrellis({
  query: generatedQuery,
  mutation: generatedMutation,
})

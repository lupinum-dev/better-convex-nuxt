import { createApp } from '@lupinum/trellis/functions'

import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { getActorFromPrincipal, principal } from './auth/principal'

export const { app, raw } = createApp(
  {
    query,
    mutation,
    internalQuery,
    internalMutation,
  },
  {
    principal,
    actor: getActorFromPrincipal,
  },
)

export { internalMutation, internalQuery, mutation, query }

import { createApp } from '@lupinum/trellis/functions'

import { mutation, query } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { principal } from './auth/principal'

export const { app, raw } = createApp({ query, mutation }, {
  principal,
  actor: getActorFromPrincipal,
  tenantIsolation: {
    tables: ['todos'],
  },
})

export { query, mutation }

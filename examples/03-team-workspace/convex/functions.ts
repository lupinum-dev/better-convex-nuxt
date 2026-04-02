import { createFunctions } from 'better-convex-nuxt/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { query: appQuery, mutation: appMutation } = createFunctions(query, mutation, {
  actor: getActor,
  tenantIsolation: {
    tables: ['todos'],
  },
})

export { query, mutation }

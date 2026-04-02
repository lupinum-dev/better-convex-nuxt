import { createFunctions, defineHandler } from 'better-convex-nuxt/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { query: appQuery, mutation: appMutation } = createFunctions(query, mutation, {
  actor: getActor,
  tenantIsolation: {
    tables: ['todos'],
  },
})

export const app = defineHandler(appQuery, appMutation)

export { query, mutation }

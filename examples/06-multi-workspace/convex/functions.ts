import { createApp } from 'better-convex-nuxt/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { app, raw } = createApp(query, mutation, {
  trustedCaller: false,
  actor: getActor,
  tenantIsolation: {
    tables: ['memberships', 'projects'],
  },
})

export { query, mutation }

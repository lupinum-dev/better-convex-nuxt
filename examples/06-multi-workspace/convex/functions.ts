import { createApp } from '@lupinum/trellis/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { app, raw } = createApp(
  { query, mutation },
  {
    actor: getActor,
    tenantIsolation: {
      tables: ['memberships', 'projects'],
    },
  },
)

export { query, mutation }

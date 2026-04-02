import { createApp } from '@lupinum/trellis/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { app, raw } = createApp(query, mutation, {
  trustedCaller: false,
  actor: getActor,
  tenantIsolation: {
    tables: [
      'knowledgeBases',
      'articles',
      'enrollments',
      'articleProgress',
      'articleShares',
      'shareTokens',
    ],
  },
})

export { query, mutation }

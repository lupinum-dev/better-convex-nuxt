import { createFunctions, defineHandler } from 'better-convex-nuxt/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { query: appQuery, mutation: appMutation } = createFunctions(query, mutation, {
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

export const app = defineHandler(appQuery, appMutation)

export { query, mutation }

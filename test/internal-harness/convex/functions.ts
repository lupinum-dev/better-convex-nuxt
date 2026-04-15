import { createApp } from '@lupinum/trellis/functions'

import type { DataModel } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import type { Actor } from './auth/actor'
import { getActorFromPrincipal } from './auth/actor'
import type { InternalHarnessPrincipal } from './auth/principal'
import { principal } from './auth/principal'

export const { app, raw } = createApp<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessPrincipal,
  Actor
>(
  { query, mutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: ['posts', 'comments', 'mcpKeys'],
      field: 'organizationId',
    },
  },
)

export { query, mutation }

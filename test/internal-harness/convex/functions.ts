import { defineTrellis } from '@lupinum/trellis/functions'

import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import type { Actor } from './auth/actor'
import { getActorFromPrincipal } from './auth/actor'
import type { InternalHarnessPrincipal } from './auth/principal'
import { principal } from './auth/principal'

export const { mutation, query, raw } = defineTrellis<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessPrincipal,
  Actor
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: ['posts', 'comments', 'mcpKeys'],
      field: 'organizationId',
    },
  },
)

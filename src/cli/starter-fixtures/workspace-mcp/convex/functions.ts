import { defineTrellis } from '@lupinum/trellis/backend'

import type { TableNames } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getAppIdentityFromCaller } from './auth/appIdentity'
import { caller } from './auth/caller'
import { sharedTables, tenantTables } from './features'

const isolatedTables = [...tenantTables] as TableNames[]
const explicitlySharedTables = [...sharedTables] as TableNames[]

export const { mutation, query } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    caller,
    appIdentity: getAppIdentityFromCaller,
    isolation: {
      tables: isolatedTables,
      sharedTables: explicitlySharedTables,
    },
  },
)

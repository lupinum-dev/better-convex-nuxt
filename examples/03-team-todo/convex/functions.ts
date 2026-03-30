/**
 * Why this file exists:
 * This file defines the project's builder family once.
 * The rest of the backend only imports the specific builders it needs, and the safe defaults stay centralized.
 */
import { createFunctions } from 'better-convex-nuxt/convex'

import actorConfig from './actor.config'
import { permissionConfig } from './permissions.config'
import { todoTable } from '../shared/schemas/todo'

export const {
  publicQuery,
  authedMutation,
  openQuery,
  scopedQuery,
  scopedMutation,
} = createFunctions({
  schema: {
    todos: todoTable,
  },
  permissions: permissionConfig,
  actor: actorConfig,
  tenant: {
    orgField: 'organizationId',
    orgIdFrom: 'actor',
  },
})

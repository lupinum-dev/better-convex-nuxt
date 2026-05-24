import { defineBetterAuth } from '@lupinum/trellis/auth'

import { components, internal } from './_generated/api'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

const auth = defineBetterAuth(
  { components, internal, mutation, authConfig },
  {
    emailPassword: true,
    userFields: () => ({
      role: 'contributor' as const,
    }),
  },
)

export const authComponent = auth.authComponent
export const createAuth = auth.createAuth
// Internal bootstrap mutation used by the Trellis auth runtime.
export const createUserIfNeeded = auth.createUserIfNeeded

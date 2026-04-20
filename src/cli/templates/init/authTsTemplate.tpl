import { defineAuth } from '@lupinum/trellis/auth'

import { components, internal } from './_generated/api'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

const auth = defineAuth(
  { components, internal, mutation, authConfig },
  {
    emailPassword: true,
    // oauth: ['github', 'google'],
  },
)

export const authComponent = auth.authComponent
export const createAuth = auth.createAuth
// Internal bootstrap mutation used by the Trellis auth runtime.
export const createUserIfNeeded = auth.createUserIfNeeded

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

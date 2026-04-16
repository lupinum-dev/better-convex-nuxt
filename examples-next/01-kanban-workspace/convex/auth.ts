import { defineAuth } from '@lupinum/trellis/auth'

import { components, internal } from './_generated/api'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

export const { authComponent, createAuth } = defineAuth(
  { components, internal, mutation, authConfig },
  {
    emailPassword: true,
    userFields: () => ({
      role: 'viewer' as const,
    }),
  },
)

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()


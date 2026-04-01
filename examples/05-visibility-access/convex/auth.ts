import { defineAuth } from 'better-convex-nuxt/auth'

import { components, internal } from './_generated/api'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

export const { authComponent, createAuth, createUserIfNeeded } = defineAuth(
  { components, internal, mutation, authConfig },
  {
    emailPassword: true,
    userFields: () => ({
      role: 'contributor' as const,
    }),
  },
)

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

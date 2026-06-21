import { apiKey } from '@better-auth/api-key'
import {
  createClient,
  type GenericCtx,
  type AuthFunctions,
} from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal'
import { admin, organization } from 'better-auth/plugins'
import type { GenericDataModel } from 'convex/server'

import { components } from './_generated/api'
import schema from './betterAuth/schema'

const authConfig = {
  providers: [],
}

const authFunctions: AuthFunctions = {}

export const authComponent = createClient<GenericDataModel, typeof schema>(components.betterAuth, {
  local: { schema },
  authFunctions,
  triggers: {},
})

export function createAuthOptions(ctx: GenericCtx<GenericDataModel>): BetterAuthOptions {
  return {
    database: authComponent.adapter(ctx),
    plugins: [convex({ authConfig }), admin(), organization(), apiKey()],
  }
}

export function createAuth(ctx: GenericCtx<GenericDataModel>) {
  return betterAuth(createAuthOptions(ctx))
}

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

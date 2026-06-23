import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'

import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'

const localSiteUrl = 'http://localhost:3000'
const localSecret = 'mcp-agent-local-proof-secret-at-least-32-chars'

export const authComponent = createClient<DataModel>(components.betterAuth)

export function createAuthOptions(ctx: GenericCtx<DataModel>) {
  const siteUrl = process.env.SITE_URL ?? localSiteUrl

  return {
    baseURL: siteUrl,
    secret: process.env.BETTER_AUTH_SECRET ?? localSecret,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [convex({ authConfig })],
    trustedOrigins: [siteUrl, localSiteUrl, 'http://127.0.0.1:3000'],
  } satisfies BetterAuthOptions
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth(createAuthOptions(ctx))
}

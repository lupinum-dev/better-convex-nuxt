import { oauthProvider } from '@better-auth/oauth-provider'
import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { jwt } from 'better-auth/plugins'

import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'
import authSchema from './betterAuth/schema'

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: {
    schema: authSchema,
  },
})

export function createAuthOptions(ctx: GenericCtx<DataModel>) {
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'

  return {
    baseURL: siteUrl,
    secret: process.env.BETTER_AUTH_SECRET ?? 'platform-auth-local-proof-secret-at-least-32-chars',
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      jwt(),
      oauthProvider({
        loginPage: '/login',
        consentPage: '/oauth-consent',
        scopes: ['openid', 'profile', 'email', 'offline_access', 'project:create'],
        validAudiences: [`${siteUrl}/mcp`],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: false,
        grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
        clientRegistrationDefaultScopes: ['openid', 'profile', 'email', 'offline_access'],
        clientRegistrationAllowedScopes: ['project:create'],
        storeClientSecret: 'hashed',
        storeTokens: 'hashed',
        prefix: {
          opaqueAccessToken: 'bcn_at_',
          refreshToken: 'bcn_rt_',
          clientSecret: 'bcn_cs_',
        },
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
      }),
      convex({ authConfig }),
    ],
    trustedOrigins: [siteUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  } satisfies BetterAuthOptions
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth(createAuthOptions(ctx))
}

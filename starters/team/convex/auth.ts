import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'
import {
  createUserSyncTriggers,
  type BetterAuthUserDocLike,
} from 'better-convex-nuxt/server/createUserSyncTriggers'

import { components, internal } from './_generated/api'
import type { DataModel, Doc } from './_generated/dataModel'
import authConfig from './auth.config'

const authFunctions: AuthFunctions = internal.auth
const localTrustedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000']

function userProjectionFields(user: BetterAuthUserDocLike) {
  const fields: { name?: string; email?: string } = {}
  if (typeof user.name === 'string') fields.name = user.name
  if (typeof user.email === 'string') fields.email = user.email
  return fields
}

const userProjection = createUserSyncTriggers<BetterAuthUserDocLike, Doc<'users'>>({
  table: 'users',
  index: 'by_auth_user_id',
  authIdField: 'authUserId',
  createDoc: ({ user, now }) => ({
    authUserId: user._id,
    ...userProjectionFields(user),
    createdAt: now,
    updatedAt: now,
  }),
  patchDoc: ({ user, now }) => ({
    ...userProjectionFields(user),
    updatedAt: now,
  }),
  rebuildDoc: ({ user, now }) => ({
    ...userProjectionFields(user),
    updatedAt: now,
  }),
})

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: userProjection.user.onCreate,
      onUpdate: userProjection.user.onUpdate,
    },
  },
})

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL
  const authSecret = process.env.BETTER_AUTH_SECRET

  if (!siteUrl) {
    throw new Error('SITE_URL is required')
  }
  if (!authSecret) {
    throw new Error('BETTER_AUTH_SECRET is required')
  }

  const isLocalSite =
    siteUrl.startsWith('http://localhost') || siteUrl.startsWith('http://127.0.0.1')

  return betterAuth({
    baseURL: siteUrl,
    secret: authSecret,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      convex({
        authConfig,
        jwt: {
          definePayload: ({ user }) => ({
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image ?? undefined,
          }),
        },
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: isLocalSite
      ? Array.from(new Set([siteUrl, ...localTrustedOrigins]))
      : [siteUrl],
  })
}

export const { onCreate, onUpdate } = authComponent.triggersApi()

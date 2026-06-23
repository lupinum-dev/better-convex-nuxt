import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { createAccessControl, organization } from 'better-auth/plugins'
import {
  createUserSyncTriggers,
  type BetterAuthUserDocLike,
} from 'better-convex-nuxt/server/createUserSyncTriggers'

import type { OrganizationRole } from '../shared/organizationRoles'
import { components, internal } from './_generated/api'
import type { DataModel, Doc } from './_generated/dataModel'
import authConfig from './auth.config'
import authSchema from './betterAuth/schema'

const authFunctions: AuthFunctions = internal.auth
const localTrustedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000']

const accessControl = createAccessControl({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update'],
  project: ['create', 'read', 'update', 'delete'],
})

const ownerRole = accessControl.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update'],
  project: ['create', 'read', 'update', 'delete'],
})

const adminRole = accessControl.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update'],
  project: ['create', 'read', 'update', 'delete'],
})

const memberRole = accessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  project: ['create', 'read', 'update'],
})

const viewerRole = accessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  project: ['read'],
})

const organizationRoleConfig = {
  owner: ownerRole,
  admin: adminRole,
  member: memberRole,
  viewer: viewerRole,
} satisfies Record<
  OrganizationRole,
  typeof ownerRole | typeof adminRole | typeof memberRole | typeof viewerRole
>

function userProjectionFields(user: BetterAuthUserDocLike) {
  const fields: { name?: string; email?: string; image?: string } = {}
  if (typeof user.name === 'string') fields.name = user.name
  if (typeof user.email === 'string') fields.email = user.email
  if (typeof user.image === 'string') fields.image = user.image
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

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: {
    schema: authSchema,
  },
  authFunctions,
  triggers: {
    user: {
      onCreate: userProjection.user.onCreate,
      onUpdate: userProjection.user.onUpdate,
      onDelete: userProjection.user.onDelete,
    },
  },
})

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
  const authSecret = process.env.BETTER_AUTH_SECRET ?? 'schema-generation-secret'
  const isLocalSite =
    siteUrl.startsWith('http://localhost') || siteUrl.startsWith('http://127.0.0.1')

  return {
    baseURL: siteUrl,
    secret: authSecret,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      organization({
        ac: accessControl,
        roles: organizationRoleConfig,
        requireEmailVerificationOnInvitation: process.env.ALLOW_TEST_RESET !== 'true',
        teams: {
          enabled: true,
        },
      }),
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
    advanced: {
      database: {
        generateId: false,
      },
    },
    trustedOrigins: isLocalSite
      ? Array.from(new Set([siteUrl, ...localTrustedOrigins]))
      : [siteUrl],
  } satisfies BetterAuthOptions
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  if (!process.env.SITE_URL) {
    throw new Error('SITE_URL is required')
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required')
  }

  return betterAuth(createAuthOptions(ctx))
}

export type AppAuth = ReturnType<typeof createAuth>

export const { onCreate, onUpdate } = authComponent.triggersApi()

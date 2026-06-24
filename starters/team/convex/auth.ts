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
import { sendStarterEmail } from './lib/authEmail'

const authFunctions: AuthFunctions = internal.auth
const localTrustedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000']

type InvitationEmailData = {
  id: string
  email: string
  organization: {
    name: string
  }
  inviter: {
    user: {
      name?: string | null
      email: string
    }
  }
}

type VerificationEmailData = {
  url: string
  user: {
    email: string
  }
}

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

function invitationLink(siteUrl: string, invitationId: string) {
  return `${siteUrl.replace(/\/+$/, '')}/invitations/${encodeURIComponent(invitationId)}`
}

async function sendInvitationEmail(siteUrl: string, data: InvitationEmailData) {
  const link = invitationLink(siteUrl, data.id)
  const inviterName = data.inviter.user.name?.trim() || data.inviter.user.email
  await sendStarterEmail({
    recipient: data.email,
    siteUrl,
    fallbackLabel: 'Invitation link',
    fallbackUrl: link,
    content: {
      subject: `${inviterName} invited you to join ${data.organization.name}`,
      text: [
        `${inviterName} invited you to join ${data.organization.name}.`,
        '',
        `Accept the invitation: ${link}`,
      ].join('\n'),
      html: `<p>${inviterName} invited you to join <strong>${data.organization.name}</strong>.</p><p><a href="${link}">Accept the invitation</a></p>`,
    },
  })
}

async function sendVerificationEmail(siteUrl: string, data: VerificationEmailData) {
  await sendStarterEmail({
    recipient: data.user.email,
    siteUrl,
    fallbackLabel: 'Verification link',
    fallbackUrl: data.url,
    content: {
      subject: 'Verify your email address',
      text: `Click the link to verify your email: ${data.url}`,
      html: `<p><a href="${data.url}">Verify your email address</a></p>`,
    },
  })
}

function userProjectionFields(user: BetterAuthUserDocLike) {
  return {
    name: user.name ?? undefined,
    email: user.email ?? undefined,
    image: user.image ?? undefined,
  }
}

function userProjectionPatchFields(
  user: BetterAuthUserDocLike,
  previousUser: BetterAuthUserDocLike,
) {
  const nameChanged = user.name !== previousUser.name
  const emailChanged = user.email !== previousUser.email
  const imageChanged = user.image !== previousUser.image

  if (!nameChanged && !emailChanged && !imageChanged) {
    return null
  }

  return {
    ...(nameChanged ? { name: user.name ?? undefined } : {}),
    ...(emailChanged ? { email: user.email ?? undefined } : {}),
    ...(imageChanged ? { image: user.image ?? undefined } : {}),
  }
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
  patchDoc: ({ user, previousUser, now }) => {
    const fields = userProjectionPatchFields(user, previousUser)
    if (!fields) {
      return null
    }

    return {
      ...fields,
      updatedAt: now,
    }
  },
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
    emailVerification: {
      sendOnSignIn: true,
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail(data) {
        await sendVerificationEmail(siteUrl, data as VerificationEmailData)
      },
    },
    plugins: [
      organization({
        ac: accessControl,
        roles: organizationRoleConfig,
        requireEmailVerificationOnInvitation: true,
        async sendInvitationEmail(data) {
          await sendInvitationEmail(siteUrl, data as InvitationEmailData)
        },
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

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

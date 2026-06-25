import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { createAccessControl, organization } from 'better-auth/plugins'

import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'
import authSchema from './betterAuth/schema'

export const projectAccessControl = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'delete'],
})

export const ownerRole = projectAccessControl.newRole({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'delete'],
})

export const memberRole = projectAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  project: ['create', 'read'],
})

export const viewerRole = projectAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  project: ['read'],
})

export const organizationPermissionOptions = {
  ac: projectAccessControl,
  roles: {
    owner: ownerRole,
    admin: ownerRole,
    member: memberRole,
    viewer: viewerRole,
  },
}

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: {
    schema: authSchema,
  },
})

export function createAuthOptions(ctx: GenericCtx<DataModel>) {
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'

  return {
    baseURL: siteUrl,
    secret:
      process.env.BETTER_AUTH_SECRET ??
      'agentic-saas-local-proof-secret-at-least-32-chars',
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      organization({
        ...organizationPermissionOptions,
        requireEmailVerificationOnInvitation: false,
      }),
      convex({ authConfig }),
    ],
    trustedOrigins: [siteUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  } satisfies BetterAuthOptions
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth(createAuthOptions(ctx))
}

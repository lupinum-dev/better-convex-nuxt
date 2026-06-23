import { apiKey } from '@better-auth/api-key'
import { passkey } from '@better-auth/passkey'
import { scim } from '@better-auth/scim'
import { stripe } from '@better-auth/stripe'
import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import {
  admin,
  createAccessControl,
  deviceAuthorization,
  emailOTP,
  genericOAuth,
  magicLink,
  mcp,
  oidcProvider,
  oAuthProxy,
  organization,
  twoFactor,
} from 'better-auth/plugins'
import {
  createUserSyncTriggers,
  type BetterAuthUserDocLike,
} from 'better-convex-nuxt/server/createUserSyncTriggers'

import { components, internal } from './_generated/api'
import type { DataModel, Doc } from './_generated/dataModel'
import authConfig from './auth.config'
import authSchema from './betterAuth/schema'
import { stripeSubscriptionPlans } from './billingPlans'

const authFunctions: AuthFunctions = internal.auth
const localTrustedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000']
const platformExperimentScopes = ['project:create']

function splitEnvList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function localExperimentOtp() {
  return process.env.ALLOW_TEST_RESET === 'true' ? '123456' : undefined
}

function localExperimentMagicLinkToken(email: string) {
  return `local-magic-link-${email.replace(/[^a-z\d]/gi, '-')}`
}

function createLocalStripeClient() {
  return {
    prices: {
      async list() {
        return { data: [] }
      },
      async retrieve(id: string) {
        return {
          id,
          recurring: {
            usage_type: 'licensed',
          },
        }
      },
    },
    customers: {
      async search() {
        return { data: [] }
      },
      async create(params: { name?: string; email?: string; metadata?: Record<string, string> }) {
        return {
          id: `cus_local_${params.metadata?.organizationId ?? params.metadata?.userId ?? 'unknown'}`,
          deleted: false,
          name: params.name ?? null,
          email: params.email ?? null,
          metadata: params.metadata ?? {},
        }
      },
      async list() {
        return []
      },
      async retrieve(id: string) {
        return { id, deleted: false, name: 'Local Stripe Customer' }
      },
      async update(id: string, params: { name?: string }) {
        return { id, deleted: false, name: params.name ?? 'Local Stripe Customer' }
      },
    },
    subscriptions: {
      async list() {
        return { data: [] }
      },
      async retrieve(id: string) {
        const now = Math.floor(Date.now() / 1000)
        return {
          id,
          status: 'active',
          cancel_at_period_end: false,
          cancel_at: null,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
          items: {
            data: [
              {
                id: `si_${id}`,
                quantity: 1,
                current_period_start: now,
                current_period_end: now + 30 * 24 * 60 * 60,
                price: {
                  id: 'price_local_team',
                  recurring: {
                    interval: 'month',
                    usage_type: 'licensed',
                  },
                },
              },
            ],
          },
        }
      },
    },
    checkout: {
      sessions: {
        async create(params: {
          customer?: string
          client_reference_id?: string
          line_items?: unknown[]
          metadata?: Record<string, string>
          subscription_data?: {
            metadata?: Record<string, string>
          }
          success_url?: string
          cancel_url?: string
        }) {
          return {
            id: `cs_local_${params.metadata?.subscriptionId ?? 'unknown'}`,
            url: 'http://localhost:3000/billing/local-checkout',
            customer: params.customer,
            client_reference_id: params.client_reference_id,
            line_items: params.line_items ?? [],
            metadata: params.metadata ?? {},
            subscription_data: params.subscription_data,
            success_url: params.success_url,
            cancel_url: params.cancel_url,
          }
        },
        async retrieve(id: string) {
          const subscriptionId = id.replace(/^cs_local_/, '')
          return {
            id,
            metadata: {
              subscriptionId,
            },
            payment_status: 'paid',
            subscription: `sub_local_${subscriptionId}`,
          }
        },
      },
    },
    billingPortal: {
      sessions: {
        async create() {
          return { url: 'http://localhost:3000/billing/local-portal' }
        },
      },
    },
    subscriptionSchedules: {
      async list() {
        return { data: [] }
      },
      async release(id: string) {
        return { id }
      },
      async update(id: string) {
        return { id }
      },
    },
    webhooks: {
      async constructEventAsync() {
        throw new Error('Local Stripe webhook verification is not configured')
      },
      constructEvent() {
        throw new Error('Local Stripe webhook verification is not configured')
      },
    },
  } as unknown as Parameters<typeof stripe>[0]['stripeClient']
}

const b2bAccessControl = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  apiKey: ['create', 'read', 'update', 'delete'],
  project: ['create', 'read', 'update', 'delete'],
})

const ownerRole = b2bAccessControl.newRole({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  apiKey: ['create', 'read', 'update', 'delete'],
  project: ['create', 'read', 'update', 'delete'],
})

const adminRole = b2bAccessControl.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  apiKey: ['create', 'read', 'update', 'delete'],
  project: ['create', 'read', 'update', 'delete'],
})

const memberRole = b2bAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ['read'],
  apiKey: ['read'],
  project: ['create', 'read'],
})

const viewerRole = b2bAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  apiKey: [],
  project: ['read'],
})

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
  const platformExperiment = process.env.BETTER_AUTH_PLATFORM_EXPERIMENT
  const scimExperiment = process.env.BETTER_AUTH_SCIM_EXPERIMENT === 'true'
  const genericOAuthExperiment = process.env.BETTER_AUTH_GENERIC_OAUTH_EXPERIMENT === 'true'
  const oauthProxyExperiment = process.env.BETTER_AUTH_OAUTH_PROXY_EXPERIMENT === 'true'
  const stripeExperiment = process.env.BETTER_AUTH_STRIPE_EXPERIMENT === 'true'
  const allowRemoveAllTeamsExperiment =
    process.env.BETTER_AUTH_ALLOW_REMOVE_ALL_TEAMS_EXPERIMENT === 'true'

  const isLocalSite =
    siteUrl.startsWith('http://localhost') || siteUrl.startsWith('http://127.0.0.1')

  return {
    baseURL: siteUrl,
    secret: authSecret,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        locale: {
          type: 'string',
          required: false,
        },
        timezone: {
          type: 'string',
          required: false,
        },
        marketingOptIn: {
          type: 'boolean',
          required: false,
        },
      },
    },
    plugins: [
      admin({
        adminUserIds: splitEnvList(process.env.BETTER_AUTH_ADMIN_USER_IDS),
      }),
      twoFactor({
        issuer: 'Better Convex Nuxt Team',
      }),
      emailOTP({
        generateOTP: localExperimentOtp,
        storeOTP: 'hashed',
        async sendVerificationOTP() {
          if (process.env.ALLOW_TEST_RESET === 'true') return
          throw new Error('Email OTP delivery is not configured')
        },
      }),
      magicLink({
        ...(process.env.ALLOW_TEST_RESET === 'true'
          ? { generateToken: localExperimentMagicLinkToken }
          : {}),
        storeToken: 'hashed',
        async sendMagicLink() {
          if (process.env.ALLOW_TEST_RESET === 'true') return
          throw new Error('Magic link delivery is not configured')
        },
      }),
      passkey({
        rpName: 'Better Convex Nuxt Team',
        rpID: isLocalSite ? 'localhost' : new URL(siteUrl).hostname,
        origin: isLocalSite ? localTrustedOrigins : siteUrl,
      }),
      organization({
        ac: b2bAccessControl,
        dynamicAccessControl: {
          enabled: true,
          maximumRolesPerOrganization: 20,
        },
        roles: {
          owner: ownerRole,
          admin: adminRole,
          member: memberRole,
          viewer: viewerRole,
        },
        requireEmailVerificationOnInvitation: process.env.ALLOW_TEST_RESET !== 'true',
        schema: {
          organization: {
            additionalFields: {
              plan: {
                type: 'string',
                required: false,
              },
              region: {
                type: 'string',
                required: false,
              },
            },
          },
          member: {
            additionalFields: {
              title: {
                type: 'string',
                required: false,
              },
              department: {
                type: 'string',
                required: false,
              },
              billable: {
                type: 'boolean',
                required: false,
              },
            },
          },
          team: {
            additionalFields: {
              color: {
                type: 'string',
                required: false,
              },
            },
          },
          invitation: {
            additionalFields: {
              note: {
                type: 'string',
                required: false,
              },
            },
          },
        },
        teams: {
          enabled: true,
          ...(allowRemoveAllTeamsExperiment ? { allowRemovingAllTeams: true } : {}),
        },
      }),
      apiKey([
        {
          configId: 'user-keys',
          defaultPrefix: 'usr_',
          rateLimit: {
            enabled: false,
          },
        },
        {
          configId: 'org-keys',
          defaultPrefix: 'org_',
          references: 'organization',
          rateLimit: {
            enabled: false,
          },
        },
        {
          configId: 'org-project-writer',
          defaultPrefix: 'orgw_',
          references: 'organization',
          permissions: {
            defaultPermissions: {
              project: ['create'],
            },
          },
          rateLimit: {
            enabled: false,
          },
        },
        {
          configId: 'org-project-reader',
          defaultPrefix: 'orgr_',
          references: 'organization',
          permissions: {
            defaultPermissions: {
              project: ['read'],
            },
          },
          rateLimit: {
            enabled: false,
          },
        },
      ]),
      ...(scimExperiment
        ? [
            scim({
              requiredRole: ['owner'],
              storeSCIMToken: 'hashed',
              canGenerateToken: ({ organizationId }) => typeof organizationId === 'string',
            }),
          ]
        : []),
      ...(process.env.ALLOW_TEST_RESET === 'true'
        ? [
            ...(stripeExperiment
              ? [
                  stripe({
                    stripeClient: createLocalStripeClient(),
                    stripeWebhookSecret: 'whsec_local_experiment',
                    createCustomerOnSignUp: false,
                    organization: {
                      enabled: true,
                    },
                    subscription: {
                      enabled: true,
                      plans: stripeSubscriptionPlans(),
                      requireEmailVerification: false,
                      async authorizeReference({ user, referenceId }, endpointCtx) {
                        const member = await endpointCtx.context.adapter.findOne({
                          model: 'member',
                          where: [
                            { field: 'organizationId', value: referenceId },
                            { field: 'userId', value: user.id },
                          ],
                        })
                        return Boolean(member)
                      },
                    },
                  }),
                ]
              : []),
            deviceAuthorization({
              expiresIn: '10m',
              interval: '1s',
              schema: {},
              validateClient: (clientId) => clientId === 'team-device-client',
              verificationUri: '/device',
            }),
            ...(genericOAuthExperiment
              ? [
                  genericOAuth({
                    config: [
                      {
                        providerId: 'local-generic-oauth',
                        clientId: 'local-generic-client',
                        clientSecret: 'local-generic-secret',
                        authorizationUrl: 'http://localhost:3999/oauth/authorize',
                        tokenUrl: 'http://localhost:3999/oauth/token',
                        scopes: ['profile', 'email'],
                        accessTokenExpiresIn: 60 * 60,
                        async getToken({ code }) {
                          return {
                            accessToken: `local-generic-access-${code}`,
                            refreshToken: `local-generic-refresh-${code}`,
                            accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
                            refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                            scopes: ['profile', 'email'],
                          }
                        },
                        async getUserInfo(tokens) {
                          const suffix =
                            tokens.accessToken?.replace(/^local-generic-access-/, '') || 'unknown'
                          return {
                            id: `local-generic-sub-${suffix}`,
                            name: 'Generic OAuth User',
                            email: `generic-oauth-${suffix}@example.com`,
                            emailVerified: true,
                          }
                        },
                      },
                    ],
                  }),
                  ...(oauthProxyExperiment
                    ? [
                        oAuthProxy({
                          currentURL: 'http://127.0.0.1:3000',
                          productionURL: siteUrl,
                          secret: authSecret,
                        }),
                      ]
                    : []),
                ]
              : []),
            ...(platformExperiment === 'mcp'
              ? [
                  mcp({
                    loginPage: '/login',
                    resource: 'http://localhost:3000/mcp',
                    oidcConfig: {
                      consentPage: '/oauth-consent',
                      loginPage: '/login',
                      requirePKCE: false,
                      scopes: platformExperimentScopes,
                    },
                  }),
                ]
              : [
                  oidcProvider({
                    __skipDeprecationWarning: true,
                    allowDynamicClientRegistration: true,
                    consentPage: '/oauth-consent',
                    loginPage: '/login',
                    requirePKCE: false,
                    scopes: platformExperimentScopes,
                    storeClientSecret: 'hashed',
                  }),
                ]),
          ]
        : []),
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

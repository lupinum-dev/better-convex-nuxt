/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GenericDataModel, GenericMutationCtx } from 'convex/server'

type MutationCtx = GenericMutationCtx<GenericDataModel>

/**
 * Auth user document as provided by Better Auth triggers.
 * This represents the Better Auth internal user, not the app user.
 *
 * Fields match the Convex component's `user` table schema. Plugin-contributed
 * fields (e.g. `twoFactorEnabled`) are marked optional since they are only
 * present when the corresponding Better Auth plugin is active.
 */
export type AuthUserDoc = {
  _id: string
  _creationTime: number
  email: string
  emailVerified: boolean
  name: string
  image?: string | null
  createdAt: number
  updatedAt: number
}

/**
 * Options for defineAuth.
 *
 * Controls how the auth bridge between Better Auth and Convex is set up,
 * including user sync triggers and the bootstrap mutation.
 *
 * This API is intentionally narrow: it configures authentication plumbing,
 * not app-domain authorization. Use Better Auth for identity/session features
 * and keep tenant membership, business roles, and domain permissions in your
 * application model.
 */
export interface DefineAuthOptions {
  /** Enable email/password auth. @default true */
  emailPassword?: boolean

  /**
   * Extra fields merged into the app user row on creation.
   * Reserved module-owned keys (authId, email, displayName, createdAt, updatedAt)
   * are rejected.
   */
  userFields?: (authUser: {
    authId: string
    email: string
    displayName: string
  }) => Record<string, unknown>

  /** Hook called after a user row is created in the users table. */
  onUserCreated?: (ctx: MutationCtx, userId: string) => Promise<void>

  /** Hook called after a user row is updated from auth sync. */
  onUserUpdated?: (ctx: MutationCtx, userId: string) => Promise<void>

  /** Hook called after a user row is deleted from auth sync. Only fires when a matching app user row was found and deleted. */
  onUserDeleted?: (ctx: MutationCtx, authId: string) => Promise<void>

  /**
   * Full escape hatch: provide a custom Better Auth builder.
   * When set, the module hands you the adapter and gets out of the way.
   * Use this for auth-centric Better Auth configuration such as social
   * providers, admin, or other auth-side plugins. emailPassword is ignored.
   */
  custom?: (ctx: any, bridge: ConvexAuthBridge) => any
}

/**
 * Bridge object passed to the `custom` escape hatch in `defineAuth`.
 *
 * Provides the building blocks needed to configure a custom Better Auth
 * instance without coupling to the module's internal wiring.
 */
export type ConvexAuthBridge = {
  /** The site URL derived from `process.env.SITE_URL` (fallback: `http://localhost:3000`). */
  siteUrl: string
  /** Origins trusted for CORS/CSRF, derived from `siteUrl`. */
  trustedOrigins: string[]
  /** Per-request Better Auth database adapter backed by Convex. Obtained from `authComponent.adapter(ctx)`. */
  database: unknown
  /** Creates a configured `convex()` Better Auth plugin. Pass optional overrides to customize. */
  createConvexPlugin: (overrides?: Record<string, unknown>) => unknown
}

/**
 * Project-specific dependencies that must be passed in from the app's
 * generated Convex code. These can't be imported by the module directly
 * because they're code-generated per project.
 */
export interface DefineAuthDeps {
  /** `components` from './_generated/api' */
  components: { betterAuth: unknown }
  /** `internal` from './_generated/api' */
  internal: Record<string, unknown>
  /** `mutation` from './_generated/server' */
  mutation: (...args: any[]) => any
  /** Default export from './auth.config' */
  authConfig: unknown
}

const RESERVED_USER_FIELD_KEYS = ['authId', 'email', 'displayName', 'createdAt', 'updatedAt']
const LOCAL_JWKS_BOOTSTRAP_SENTINEL = '__TRELLIS_LOCAL_JWKS_BOOTSTRAP__'

function buildTrustedOrigins(siteUrl: string): string[] {
  const trustedOrigins = new Set<string>()

  try {
    const origin = new URL(siteUrl)
    trustedOrigins.add(origin.origin)

    if (
      origin.protocol === 'http:' &&
      (origin.hostname === '127.0.0.1' || origin.hostname === 'localhost')
    ) {
      const alternateHost = origin.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'
      trustedOrigins.add(
        new URL(`${origin.protocol}//${alternateHost}${origin.port ? `:${origin.port}` : ''}`)
          .origin,
      )
    }
  } catch {
    trustedOrigins.add(siteUrl)
  }

  return [...trustedOrigins]
}

/**
 * Define the auth bridge between Better Auth and Convex.
 *
 * Encapsulates user sync triggers, the bootstrap mutation, and the
 * Better Auth adapter. You configure what you need on the authentication
 * side; the module handles the plumbing.
 *
 * @example
 * ```ts
 * import { defineAuth } from '@lupinum/trellis/auth'
 * import { components, internal } from './_generated/api'
 * import { mutation } from './_generated/server'
 * import authConfig from './auth.config'
 *
 * export const { authComponent, createAuth, createUserIfNeeded } = defineAuth(
 *   { components, internal, mutation, authConfig },
 *   { emailPassword: true },
 * )
 * ```
 */
export function defineAuth(deps: DefineAuthDeps, options: DefineAuthOptions = {}) {
  // Lazy-import @convex-dev/better-auth at call time so this file
  // can be imported without the dependency being present (e.g. in tests).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@convex-dev/better-auth') as {
    createClient: any
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { convex } = require('@convex-dev/better-auth/plugins') as {
    convex: any
  }

  const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
  const trustedOrigins = buildTrustedOrigins(siteUrl)
  const staticJwks =
    process.env.JWKS && process.env.JWKS !== LOCAL_JWKS_BOOTSTRAP_SENTINEL
      ? process.env.JWKS
      : undefined
  const authFunctions = deps.internal.auth

  if (!authFunctions) {
    throw new Error(
      '[trellis] defineAuth() requires `internal.auth` from your generated Convex API.',
    )
  }

  function findUserByAuthId(ctx: any, authId: string) {
    return ctx.db
      .query('users')
      .withIndex('by_auth_id', (q: any) => q.eq('authId', authId))
      .first()
  }

  function getExtraUserFields(input: {
    authId: string
    email: string
    displayName: string
  }): Record<string, unknown> {
    if (!options.userFields) {
      return {}
    }

    const extra = options.userFields(input)
    for (const reservedKey of RESERVED_USER_FIELD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(extra, reservedKey)) {
        throw new Error(`defineAuth.userFields must not define reserved key "${reservedKey}".`)
      }
    }

    return extra
  }

  function buildUserFields(
    input: { authId: string; email: string; displayName: string },
    now: number,
  ): Record<string, unknown> {
    return {
      authId: input.authId,
      email: input.email,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now,
      ...getExtraUserFields(input),
    }
  }

  async function ensureUserForAuthIdentity(
    ctx: any,
    input: { authId: string; email: string; displayName: string },
  ): Promise<{ userId: any; created: boolean }> {
    const existingUser = await findUserByAuthId(ctx, input.authId)
    if (existingUser) {
      return { userId: existingUser._id, created: false }
    }

    const userId = await ctx.db.insert('users', buildUserFields(input, Date.now()))
    return { userId, created: true }
  }

  const authComponent = createClient(deps.components.betterAuth, {
    authFunctions,
    triggers: {
      user: {
        onCreate: async (ctx: any, doc: AuthUserDoc) => {
          const { userId, created } = await ensureUserForAuthIdentity(ctx, {
            authId: doc._id,
            email: doc.email,
            displayName: doc.name,
          })
          if (created && options.onUserCreated) {
            await options.onUserCreated(ctx, userId)
          }
        },
        onUpdate: async (ctx: any, doc: AuthUserDoc) => {
          const user = await findUserByAuthId(ctx, doc._id)

          if (!user) return

          await ctx.db.patch(user._id, {
            email: doc.email,
            displayName: doc.name,
            updatedAt: Date.now(),
          })

          if (options.onUserUpdated) {
            await options.onUserUpdated(ctx, user._id)
          }
        },
        onDelete: async (ctx: any, doc: AuthUserDoc) => {
          const user = await findUserByAuthId(ctx, doc._id)

          if (user) {
            await ctx.db.delete(user._id)

            if (options.onUserDeleted) {
              await options.onUserDeleted(ctx, doc._id)
            }
          }
        },
      },
    },
  })

  const bridge: Omit<ConvexAuthBridge, 'database'> = {
    siteUrl,
    trustedOrigins,
    createConvexPlugin: (overrides) =>
      convex({
        authConfig: deps.authConfig,
        ...(staticJwks ? { jwks: staticJwks } : {}),
        ...(overrides ?? {}),
      }),
  }

  const createAuth = options.custom
    ? (ctx: any) =>
        options.custom!(ctx, {
          ...bridge,
          database: authComponent.adapter(ctx),
        })
    : (ctx: any) => {
        // Dynamic import of betterAuth for the default path
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { betterAuth } = require('better-auth') as { betterAuth: any }

        return betterAuth({
          baseURL: bridge.siteUrl,
          database: authComponent.adapter(ctx),
          emailAndPassword: {
            enabled: options.emailPassword !== false,
          },
          // The Convex adapter already persists Better Auth data, so rate limits
          // should use durable shared storage instead of per-instance memory.
          rateLimit: {
            storage: 'database',
          },
          plugins: [bridge.createConvexPlugin()],
          trustedOrigins: bridge.trustedOrigins,
        })
      }

  const createUserIfNeeded = deps.mutation({
    args: {},
    handler: async (ctx: any) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        throw new Error('Not authenticated.')
      }

      const { userId } = await ensureUserForAuthIdentity(ctx, {
        authId: identity.subject,
        // Convex UserIdentity.email and .name are optional — guard against
        // providers that omit them (e.g. anonymous auth, some OIDC configs).
        email: identity.email ?? '',
        displayName: identity.name ?? '',
      })

      return userId
    },
  })

  return {
    authComponent,
    createAuth,
    createUserIfNeeded,
  }
}

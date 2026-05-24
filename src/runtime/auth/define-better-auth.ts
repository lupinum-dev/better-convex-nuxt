/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'
import type {
  AuthConfig,
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
} from 'convex/server'

import { getAuth, type AuthIdentity } from './auth-identity.js'

type MutationCtx = GenericMutationCtx<GenericDataModel>

type BetterAuthComponentApi = {
  adapter: {
    create: FunctionReference<'mutation', 'internal'>
    findOne: FunctionReference<'query', 'internal'>
    findMany: FunctionReference<'query', 'internal'>
    updateOne: FunctionReference<'mutation', 'internal'>
    updateMany: FunctionReference<'mutation', 'internal'>
    deleteOne: FunctionReference<'mutation', 'internal'>
    deleteMany: FunctionReference<'mutation', 'internal'>
  }
}

/**
 * Options for defineBetterAuth.
 *
 * Controls how the auth bridge between Better Auth and Convex is set up.
 * Trellis app users are bootstrapped from Convex auth identity, not from Better
 * Auth component rows. This keeps app foreign keys provider-independent.
 *
 * This API is intentionally narrow: it configures authentication plumbing,
 * not app-domain authorization. Use Better Auth for identity/session features
 * and keep tenant membership, business roles, and domain permissions in your
 * application model.
 */
export interface DefineBetterAuthOptions {
  /** Enable email/password auth. @default true */
  emailPassword?: boolean

  /**
   * Optional Better Auth rate-limit storage override.
   * Omit to keep Better Auth's default behavior.
   */
  rateLimit?: { storage: 'memory' | 'database' } | false

  /**
   * Extra fields merged into the app user row on creation.
   * Reserved module-owned keys (authKey, email, displayName, avatarUrl, createdAt, updatedAt)
   * are rejected.
   */
  userFields?: (authUser: {
    authKey: string
    email?: string
    displayName?: string
    avatarUrl?: string
  }) => Record<string, unknown>

  /** Hook called after a user row is created in the users table. */
  onUserCreated?: (ctx: MutationCtx, userId: string) => Promise<void>

  /** Hook called after an existing user row is refreshed from Convex auth identity. */
  onUserUpdated?: (ctx: MutationCtx, userId: string) => Promise<void>

  /**
   * Full escape hatch: provide a custom Better Auth builder.
   * When set, the module hands you the adapter and gets out of the way.
   * Use this for auth-centric Better Auth configuration such as social
   * providers, admin, or other auth-side plugins. emailPassword is ignored.
   */
  custom?: (ctx: any, bridge: BetterAuthBridge) => any
}

/**
 * Bridge object passed to the `custom` escape hatch in `defineBetterAuth`.
 *
 * Provides the building blocks needed to configure a custom Better Auth
 * instance without coupling to the module's internal wiring.
 */
export type BetterAuthBridge = {
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
export interface DefineBetterAuthDeps {
  /** `components` from './_generated/api.js' */
  components: { betterAuth: BetterAuthComponentApi }
  /** `internal` from './_generated/api' */
  internal: Record<string, unknown>
  /** `mutation` from './_generated/server' */
  mutation: (...args: any[]) => any
  /** Default export from './auth.config' */
  authConfig: AuthConfig
}

const RESERVED_USER_FIELD_KEYS = [
  'authKey',
  'email',
  'displayName',
  'avatarUrl',
  'createdAt',
  'updatedAt',
]
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
 * Encapsulates the internal user bootstrap mutation and the Better Auth
 * adapter. You configure what you need on the authentication
 * side; the module handles the plumbing.
 *
 * @example
 * ```ts
 * import { defineBetterAuth } from '@lupinum/trellis/auth'
 * import { components, internal } from './_generated/api.js'
 * import { mutation } from './_generated/server.js'
 * import authConfig from './auth.config.js'
 *
 * const auth = defineBetterAuth({ components, internal, mutation, authConfig }, { emailPassword: true })
 * export const authComponent = auth.authComponent
 * export const createAuth = auth.createAuth
 * // Internal bootstrap mutation used by the Trellis auth runtime.
 * export const createUserIfNeeded = auth.createUserIfNeeded
 * ```
 */
export function defineBetterAuth(
  deps: DefineBetterAuthDeps,
  options: DefineBetterAuthOptions = {},
) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
  const trustedOrigins = buildTrustedOrigins(siteUrl)
  const staticJwks =
    process.env.JWKS && process.env.JWKS !== LOCAL_JWKS_BOOTSTRAP_SENTINEL
      ? process.env.JWKS
      : undefined
  function findUserByAuthKey(ctx: any, authKey: string) {
    return ctx.db
      .query('users')
      .withIndex('by_auth_key', (q: any) => q.eq('authKey', authKey))
      .first()
  }

  function getExtraUserFields(input: AuthIdentity): Record<string, unknown> {
    if (!options.userFields) {
      return {}
    }

    const extra = options.userFields(input)
    for (const reservedKey of RESERVED_USER_FIELD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(extra, reservedKey)) {
        throw new Error(
          `defineBetterAuth.userFields must not define reserved key "${reservedKey}".`,
        )
      }
    }

    return extra
  }

  function buildProfileFields(input: AuthIdentity): Record<string, unknown> {
    return {
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    }
  }

  async function ensureUserForAuthIdentity(
    ctx: any,
    input: AuthIdentity,
  ): Promise<{ userId: any; created: boolean; updated: boolean }> {
    const existingUser = await findUserByAuthKey(ctx, input.authKey)
    const now = Date.now()

    if (existingUser) {
      const patch = {
        ...buildProfileFields(input),
        updatedAt: now,
      }
      await ctx.db.patch(existingUser._id, patch)
      return { userId: existingUser._id, created: false, updated: true }
    }

    const userId = await ctx.db.insert('users', {
      authKey: input.authKey,
      ...buildProfileFields(input),
      createdAt: now,
      updatedAt: now,
      ...getExtraUserFields(input),
    })
    return { userId, created: true, updated: false }
  }

  const authComponent = createClient(deps.components.betterAuth)

  const bridge: Omit<BetterAuthBridge, 'database'> = {
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
        const authOptions: Record<string, unknown> = {
          baseURL: bridge.siteUrl,
          database: authComponent.adapter(ctx),
          emailAndPassword: {
            enabled: options.emailPassword !== false,
          },
          plugins: [bridge.createConvexPlugin()],
          trustedOrigins: bridge.trustedOrigins,
        }

        if (options.rateLimit && options.rateLimit.storage) {
          authOptions.rateLimit = options.rateLimit
        }

        return betterAuth(authOptions)
      }

  const createUserIfNeeded = deps.mutation({
    args: {},
    handler: async (ctx: any) => {
      const identity = await getAuth(ctx)
      if (!identity) {
        throw new Error('Not authenticated.')
      }

      const { userId, created, updated } = await ensureUserForAuthIdentity(ctx, identity)
      if (created && options.onUserCreated) await options.onUserCreated(ctx, userId)
      if (updated && options.onUserUpdated) await options.onUserUpdated(ctx, userId)

      return userId
    },
  })

  return {
    authComponent,
    createAuth,
    createUserIfNeeded,
  }
}

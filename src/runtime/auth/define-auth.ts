/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Auth user document as provided by Better Auth triggers.
 * This represents the Better Auth internal user, not the app user.
 */
export type AuthUserDoc = {
  _id: string
  email: string
  name: string
  image?: string
}

/**
 * Options for defineAuth.
 *
 * Controls how the auth bridge between Better Auth and Convex is set up,
 * including user sync triggers and the bootstrap mutation.
 */
export interface DefineAuthOptions {
  /** Enable email/password auth. @default true */
  emailPassword?: boolean

  /** OAuth providers to enable (e.g. ['github', 'google']). */
  oauth?: string[]

  /**
   * Extra fields merged into the app user row on creation.
   * The base fields (authId, email, displayName, createdAt, updatedAt) are always set.
   */
  userFields?: (authUser: {
    authId: string
    email: string
    displayName: string
  }) => Record<string, unknown>

  /** Hook called after a user row is created in the users table. */
  onUserCreated?: (ctx: any, userId: any) => Promise<void>

  /** Hook called after a user row is updated from auth sync. */
  onUserUpdated?: (ctx: any, userId: any) => Promise<void>

  /** Hook called after a user row is deleted from auth sync. */
  onUserDeleted?: (ctx: any, authId: string) => Promise<void>

  /**
   * Full escape hatch: provide a custom Better Auth builder.
   * When set, the module hands you the adapter and gets out of the way.
   * emailPassword and oauth options are ignored.
   */
  custom?: (ctx: any, bridge: ConvexAuthBridge) => any
}

export type ConvexAuthBridge = {
  siteUrl: string
  trustedOrigins: string[]
  database: any
  createConvexPlugin: (overrides?: Record<string, unknown>) => any
}

/**
 * Project-specific dependencies that must be passed in from the app's
 * generated Convex code. These can't be imported by the module directly
 * because they're code-generated per project.
 */
export interface DefineAuthDeps {
  /** `components` from './_generated/api' */
  components: any
  /** `internal` from './_generated/api' */
  internal: any
  /** `mutation` from './_generated/server' */
  mutation: any
  /** Auth config from './auth.config' */
  authConfig: any
}

/**
 * Define the auth bridge between Better Auth and Convex.
 *
 * Encapsulates user sync triggers, the bootstrap mutation, and the
 * Better Auth adapter. You configure what you need; the module handles
 * the plumbing.
 *
 * @example
 * ```ts
 * import { defineAuth } from 'better-convex-nuxt/auth'
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
  const trustedOrigins = [siteUrl, 'http://127.0.0.1:3000', 'http://localhost:3000']

  function buildUserFields(
    input: { authId: string; email: string; displayName: string },
    now: number,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      authId: input.authId,
      email: input.email,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now,
    }

    if (options.userFields) {
      const extra = options.userFields(input)
      Object.assign(base, extra)
    }

    return base
  }

  const authComponent = createClient(deps.components.betterAuth, {
    authFunctions: deps.internal.auth,
    triggers: {
      user: {
        onCreate: async (ctx: any, doc: AuthUserDoc) => {
          const now = Date.now()
          const userId = await ctx.db.insert(
            'users',
            buildUserFields(
              {
                authId: doc._id,
                email: doc.email,
                displayName: doc.name,
              },
              now,
            ),
          )
          if (options.onUserCreated) {
            await options.onUserCreated(ctx, userId)
          }
        },
        onUpdate: async (ctx: any, doc: AuthUserDoc) => {
          const user = await ctx.db
            .query('users')
            .withIndex('by_auth_id', (q: any) => q.eq('authId', doc._id))
            .first()

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
          const user = await ctx.db
            .query('users')
            .withIndex('by_auth_id', (q: any) => q.eq('authId', doc._id))
            .first()

          if (user) {
            await ctx.db.delete(user._id)
          }

          if (options.onUserDeleted) {
            await options.onUserDeleted(ctx, doc._id)
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

      const existing = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', identity.subject))
        .first()

      if (existing) {
        return existing._id
      }

      const now = Date.now()
      return await ctx.db.insert(
        'users',
        buildUserFields(
          {
            authId: identity.subject,
            email: identity.email,
            displayName: identity.name,
          },
          now,
        ),
      )
    },
  })

  return {
    authComponent,
    createAuth,
    createUserIfNeeded,
  }
}

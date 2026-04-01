import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
const trustedOrigins = [siteUrl, 'http://127.0.0.1:3000', 'http://localhost:3000']
const authFunctions: AuthFunctions = internal.auth

function buildUserFields(
  input: { authId: string; email: string; displayName: string },
  now: number,
) {
  return {
    authId: input.authId,
    email: input.email,
    displayName: input.displayName,
    role: 'student' as const,
    createdAt: now,
    updatedAt: now,
  }
}

const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        await ctx.db.insert(
          'users',
          buildUserFields(
            {
              authId: doc._id,
              email: doc.email,
              displayName: doc.name,
            },
            Date.now(),
          ),
        )
      },
      onUpdate: async (ctx, doc) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', (q) => q.eq('authId', doc._id))
          .first()

        if (!user) {
          return
        }

        await ctx.db.patch(user._id, {
          email: doc.email,
          displayName: doc.name,
          updatedAt: Date.now(),
        })
      },
      onDelete: async (ctx, doc) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', (q) => q.eq('authId', doc._id))
          .first()

        if (user) {
          await ctx.db.delete(user._id)
        }
      },
    },
  },
})

type ConvexAuthBridge = {
  siteUrl: string
  trustedOrigins: string[]
  database: ReturnType<typeof authComponent.adapter>
  createConvexPlugin: (overrides?: Record<string, unknown>) => ReturnType<typeof convex>
}

export function createConvexAuth<TAuth>(
  buildAuth: (ctx: GenericCtx<DataModel>, bridge: ConvexAuthBridge) => TAuth,
) {
  const createAuth = (ctx: GenericCtx<DataModel>) =>
    buildAuth(ctx, {
      siteUrl,
      trustedOrigins,
      database: authComponent.adapter(ctx),
      createConvexPlugin: (overrides) =>
        convex({
          authConfig,
          ...(overrides ?? {}),
        } as Parameters<typeof convex>[0]),
    })

  const createUserIfNeeded = mutation({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        throw new Error('Not authenticated.')
      }

      const existing = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
        .first()

      if (existing) {
        return existing._id
      }

      return await ctx.db.insert(
        'users',
        buildUserFields(
          {
            authId: identity.subject,
            email: identity.email,
            displayName: identity.name,
          },
          Date.now(),
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

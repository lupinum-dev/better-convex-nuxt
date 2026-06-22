import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'

const authFunctions: AuthFunctions = internal.auth
const localTrustedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000']

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        const existing = await ctx.db
          .query('users')
          .withIndex('by_subject', (q) => q.eq('subject', doc._id))
          .unique()
        const now = Date.now()

        if (existing) {
          await ctx.db.patch(existing._id, {
            name: doc.name,
            email: doc.email,
            updatedAt: now,
          })
          return
        }

        await ctx.db.insert('users', {
          subject: doc._id,
          name: doc.name,
          email: doc.email,
          createdAt: now,
          updatedAt: now,
        })
      },
      onUpdate: async (ctx, doc) => {
        const existing = await ctx.db
          .query('users')
          .withIndex('by_subject', (q) => q.eq('subject', doc._id))
          .unique()

        if (!existing) return

        await ctx.db.patch(existing._id, {
          name: doc.name,
          email: doc.email,
          updatedAt: Date.now(),
        })
      },
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

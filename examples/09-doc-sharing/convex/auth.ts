import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
const authFunctions: AuthFunctions = internal.auth

function getTrustedOrigins(): string[] {
  try {
    const url = new URL(siteUrl)
    const trusted = new Set([siteUrl])

    if (url.hostname === 'localhost') {
      trusted.add(`http://127.0.0.1:${url.port}`)
    } else if (url.hostname === '127.0.0.1') {
      trusted.add(`http://localhost:${url.port}`)
    }

    return [...trusted]
  } catch {
    return [siteUrl]
  }
}

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        const now = Date.now()
        await ctx.db.insert('users', {
          authId: doc._id,
          email: doc.email,
          displayName: doc.name,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        })
      },
      onUpdate: async (ctx, next) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', q => q.eq('authId', next._id))
          .first()

        if (!user) return

        await ctx.db.patch(user._id, {
          email: next.email,
          displayName: next.name,
          updatedAt: Date.now(),
        })
      },
      onDelete: async (ctx, doc) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', q => q.eq('authId', doc._id))
          .first()

        if (user) {
          await ctx.db.delete(user._id)
        }
      },
    },
  },
})

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      convex({
        authConfig,
      }),
    ],
    trustedOrigins: getTrustedOrigins(),
  })

export const createUserIfNeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated.')

    const existing = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
      .first()

    if (existing) return existing._id

    const now = Date.now()
    return ctx.db.insert('users', {
      authId: identity.subject,
      email: identity.email,
      displayName: identity.name,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    })
  },
})

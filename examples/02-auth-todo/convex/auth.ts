/**
 * Why this file exists:
 * This is the only auth file you should normally edit.
 * Convex plumbing, user sync triggers, and the safety-net bootstrap mutation live in `./authBridge`.
 */
import { betterAuth } from 'better-auth'

import { createConvexAuth } from './authBridge'

export const { authComponent, createAuth, createUserIfNeeded } = createConvexAuth((_ctx, bridge) =>
  betterAuth({
    baseURL: bridge.siteUrl,
    database: bridge.database,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [bridge.createConvexPlugin()],
    trustedOrigins: bridge.trustedOrigins,
  }),
)

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

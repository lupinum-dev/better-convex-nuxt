/**
 * Why this file exists:
 * This is the user-edited Better Auth file.
 * Convex-side wiring stays in `./authBridge` so the CRM policy code remains app-owned.
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

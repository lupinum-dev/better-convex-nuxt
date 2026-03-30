/**
 * Why this file exists:
 * Better Auth needs a small Convex auth config so its component can register routes and issue JWTs.
 */
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig

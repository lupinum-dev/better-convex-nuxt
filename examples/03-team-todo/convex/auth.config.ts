/**
 * Why this file exists:
 * Better Auth uses this small config to register its Convex auth provider.
 */
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig

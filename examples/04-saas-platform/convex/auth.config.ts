/**
 * Why this file exists:
 * Better Auth registers its Convex provider through this small config file.
 */
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig

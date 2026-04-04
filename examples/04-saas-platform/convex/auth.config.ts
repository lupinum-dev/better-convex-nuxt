/**
 * Why this file exists:
 * Better Auth registers its Convex provider through this small config file.
 */
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

const jwks = process.env.JWKS === '__TRELLIS_LOCAL_JWKS_BOOTSTRAP__' ? undefined : process.env.JWKS

export default {
  providers: [getAuthConfigProvider(jwks ? { jwks } : undefined)],
} satisfies AuthConfig

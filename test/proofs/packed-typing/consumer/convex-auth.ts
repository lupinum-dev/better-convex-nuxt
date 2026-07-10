// Host-owned auth-client definition WITH the API-key client plugin.
// Mirrors vNext §8 "Example consumer definition" and §10.2 Ginko's definition.
import { apiKeyClient } from '@better-auth/api-key/client'
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'

export default defineConvexAuthClient({
  plugins: [apiKeyClient()],
})

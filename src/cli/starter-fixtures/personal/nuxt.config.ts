import { convexLocal } from 'convex-vite-plugin'

const useLocalConvex = process.env.USE_LOCAL_CONVEX === 'true'
const resetLocalBackend = process.env.RESET_LOCAL_BACKEND === 'true'
const localConvexUrl = 'http://127.0.0.1:3210'
const siteUrl = process.env.SITE_URL || 'http://localhost:3000'

export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: useLocalConvex ? localConvexUrl : process.env.CONVEX_URL,
    auth: true,
  },
  hooks: {
    'vite:extendConfig': (config, { isClient }) => {
      if (!useLocalConvex || !isClient) return
      config.plugins = [
        ...(config.plugins ?? []),
        convexLocal({
          instanceName: 'trellis-starter-personal',
          stateIdSuffix: 'trellis-starter-personal-local-v1',
          port: 3210,
          siteProxyPort: 3211,
          convexDir: 'convex',
          reset: resetLocalBackend,
          envVars: {
            SITE_URL: siteUrl,
            AUTH_BASE_URL: process.env.AUTH_BASE_URL || siteUrl,
            AUTH_TRUSTED_ORIGINS: process.env.AUTH_TRUSTED_ORIGINS || siteUrl,
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET || 'local-dev-better-auth-secret-not-for-production',
          },
        }),
      ]
    },
  },
})

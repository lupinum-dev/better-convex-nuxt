import { convexLocal } from 'convex-vite-plugin'

const useLocalConvex = process.env.USE_LOCAL_CONVEX === 'true'
const resetLocalBackend = process.env.RESET_LOCAL_BACKEND === 'true'
const localConvexUrl = 'http://127.0.0.1:3210'

export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: useLocalConvex ? localConvexUrl : process.env.CONVEX_URL,
    auth: false,
  },
  hooks: {
    'vite:extendConfig': (config, { isClient }) => {
      if (!useLocalConvex || !isClient) return
      config.plugins = [
        ...(config.plugins ?? []),
        convexLocal({
          instanceName: 'trellis-starter-public',
          stateIdSuffix: 'trellis-starter-public-local-v1',
          port: 3210,
          siteProxyPort: 3211,
          convexDir: 'convex',
          reset: resetLocalBackend,
        }),
      ]
    },
  },
})

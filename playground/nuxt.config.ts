export default defineNuxtConfig({
  modules: ['../src/module'],

  pages: true,

  devtools: { enabled: true },

  typescript: {
    strict: true,
  },

  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL, // Required for authentication
    permissions: true, // Enable createPermissions
    logging: {
      enabled: 'debug', // 'debug' shows all logs including debug-level details
      format: 'pretty', // 'pretty' for dev, 'json' for production/log aggregation
    },
  },
})

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'better-convex-nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Convex module configuration
  convex: {
    url: process.env.CONVEX_URL,
    // siteUrl auto-derives from CONVEX_URL (.convex.cloud -> .convex.site)
    // Do NOT set it to localhost - that causes self-request deadlock!
    permissions: true,
    logging: {
      enabled: true,
      format: 'pretty'
    }
  },



  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})

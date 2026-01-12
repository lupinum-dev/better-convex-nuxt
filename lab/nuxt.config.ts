// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '../src/module' // better-convex-nuxt (local module)
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Convex module configuration
  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.SITE_URL,
    permissions: true,
    skipAuthRoutes: ['/', '/auth/**'],
    logging: {
      enabled: 'debug',
      format: 'pretty'
    }
  },

  routeRules: {
    '/': { prerender: true },
    '/labs/**': { ssr: false } // CSR-only for auth-protected labs
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

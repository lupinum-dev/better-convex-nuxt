/**
 * Why this file exists:
 * This config enables the module's auth support while staying otherwise minimal.
 * The example deliberately keeps everything on one page so the auth state transitions are easy to inspect.
 */
export default defineNuxtConfig({
  modules: ['better-convex-nuxt', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: true,
  },

  typescript: {
    strict: true,
  },

  // Works in SSR and SPA
  // ssr: false,

  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL,
    auth: {
      enabled: true,
      ensureUserMutation: 'auth.createUserIfNeeded',
    },
    logging: 'debug',
    debug: {
      authFlow: true,
      clientAuthFlow: true,
      serverAuthFlow: true,
    },
  },
})

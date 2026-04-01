/**
 * Why this file exists:
 * Example 04 is the "month two" app. It keeps the same auth foundation as Example 03,
 * but adds server routes, uploads, and admin workflows on top of the same canonical workspace model.
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

  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL,
    auth: {
      enabled: true,
      ensureUserMutation: 'auth.createUserIfNeeded',
    },
    permissions: {
      query: 'workspaces.getPermissionContext',
    },
  },
})

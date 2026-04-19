/**
 * Why this file exists:
 * Example 04 is the "month two" app. It keeps the same auth foundation as Example 03,
 * but adds server routes, uploads, and admin workflows on top of the same canonical workspace model.
 */
export default defineNuxtConfig({
  modules: ['@lupinum/trellis', '@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: true,
  },

  typescript: {
    strict: true,
  },

  trellis: {
    url: process.env.CONVEX_URL,
    auth: {
      enabled: true,
    },
    permissions: {
      query: 'permissions/context.getPermissionContext',
    },
  },
})

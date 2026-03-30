/**
 * Why this file exists:
 * Example 04 is the "month two" app. It keeps the same auth foundation as Example 03,
 * but adds custom tenant naming, server routes, uploads, and admin workflows.
 */
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],

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
    auth: true,
    tenant: {
      field: 'workspaceId',
      index: 'by_workspace',
    },
  },
})

/**
 * Why this file exists:
 * The CRM example is still a normal consumer app. Auth, tenant scoping, and permissions all
 * flow through the same module surface as the earlier examples.
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
    auth: {
      enabled: true,
      ensureUserMutation: 'auth.createUserIfNeeded',
    },
    permissions: {
      query: 'workspaces.getPermissionContext',
    },
  },
})

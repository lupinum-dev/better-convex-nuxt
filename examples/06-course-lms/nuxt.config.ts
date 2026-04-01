/**
 * Why this file exists:
 * The LMS example uses the same module setup as the rest of the gallery, but the hard part lives
 * in relationship checks instead of simple role checks.
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

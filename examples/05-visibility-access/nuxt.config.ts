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

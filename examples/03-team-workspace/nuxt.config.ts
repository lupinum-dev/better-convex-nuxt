/**
 * Why this file exists:
 * This is the "full" example config. It enables auth and the MCP toolkit so the app can
 * demonstrate the complete primitives-first surface in one place.
 */
export default defineNuxtConfig({
  modules: ['@lupinum/trellis', '@nuxt/ui', '@nuxtjs/mcp-toolkit'],
  css: ['~/assets/css/main.css'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: true,
  },

  typescript: {
    strict: true,
  },

  mcp: {
    name: 'team-todo-example',
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

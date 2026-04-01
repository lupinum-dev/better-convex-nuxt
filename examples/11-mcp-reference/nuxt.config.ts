/**
 * Why this file exists:
 * This is the "full" example config. It enables auth and the MCP toolkit so the app can
 * demonstrate the complete primitives-first surface in one place.
 */
export default defineNuxtConfig({
  modules: ['better-convex-nuxt', '@nuxt/ui', '@nuxtjs/mcp-toolkit'],
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

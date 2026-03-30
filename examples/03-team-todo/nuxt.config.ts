/**
 * Why this file exists:
 * This is the "full" example config. It enables auth, tenant-aware generated aliases,
 * and the MCP toolkit so the app can demonstrate the complete V2 surface in one place.
 */
export default defineNuxtConfig({
  modules: ['better-convex-nuxt', '@nuxtjs/mcp-toolkit'],

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
    permissions: {
      config: '~/convex/permissions.config',
    },
    tenant: {
      field: 'organizationId',
      index: 'by_organization',
    },
  },
})

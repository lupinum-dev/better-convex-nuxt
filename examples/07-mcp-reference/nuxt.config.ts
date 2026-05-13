/**
 * Why this file exists:
 * Example 07 is the canonical MCP reference app. Sessions are enabled so the example can
 * demonstrate session state and dynamic per-session tool registration in the default `/mcp` route.
 */
export default defineNuxtConfig({
  modules: ['@lupinum/trellis', '@nuxt/ui', '@nuxtjs/mcp-toolkit'],
  css: ['~~/assets/css/main.css'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: true,
  },

  nitro: {
    experimental: {
      asyncContext: true,
    },
  },

  typescript: {
    strict: true,
  },

  mcp: {
    name: 'mcp-reference-example',
    sessions: true,
  },

  trellis: {
    url: process.env.CONVEX_URL,
    auth: {},
    permissions: {
      query: 'permissions/context.getAccessContext',
      codegen: true,
    },
  },
})

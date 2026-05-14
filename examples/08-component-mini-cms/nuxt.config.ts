/**
 * Why this file exists:
 * Example 08 is the smallest local-component reference app. It keeps Better Auth, a local Convex
 * component, and MCP projection in one place without adding package-authoring concerns.
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

  runtimeConfig: {
    demoMcpToken: process.env.DEMO_MCP_TOKEN,
  },

  mcp: {
    name: 'component-mini-cms-example',
  },

  trellis: {
    url: process.env.CONVEX_URL,
    auth: {},
  },
})

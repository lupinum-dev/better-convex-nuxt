import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')
const convexUrl =
  process.env.NUXT_PUBLIC_CONVEX_URL ||
  process.env.VITE_CONVEX_URL ||
  env.NUXT_PUBLIC_CONVEX_URL ||
  env.VITE_CONVEX_URL
const convexSiteUrl =
  process.env.NUXT_PUBLIC_CONVEX_SITE_URL ||
  process.env.CONVEX_SITE_URL ||
  process.env.VITE_CONVEX_SITE_URL ||
  env.NUXT_PUBLIC_CONVEX_SITE_URL ||
  env.CONVEX_SITE_URL ||
  env.VITE_CONVEX_SITE_URL
const mcpServerSecret = process.env.MCP_SERVER_SECRET || env.MCP_SERVER_SECRET || ''

export default {
  modules: ['better-convex-nuxt', '@nuxtjs/mcp-toolkit'],
  pages: true,
  devtools: { enabled: true },
  compatibilityDate: '2026-06-21',
  nitro: {
    experimental: {
      openAPI: false,
    },
  },
  typescript: {
    strict: true,
  },
  runtimeConfig: {
    mcpServerSecret,
  },
  convex: {
    url: convexUrl,
    siteUrl: convexSiteUrl,
    auth: {},
  },
  mcp: {
    route: '/mcp',
    name: 'better-convex-nuxt-mcp-agent',
    description: 'Private MCP surface for service actors.',
  },
}

import { defineNuxtConfig } from 'nuxt/config'
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

export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  pages: true,
  devtools: { enabled: true },
  compatibilityDate: '2026-06-23',
  typescript: {
    strict: true,
  },
  vite: {
    optimizeDeps: {
      // The browser verifier exercises first-load auth/codegen paths. Pre-bundling
      // these runtime deps prevents Vite's dependency discovery reload mid-flow.
      include: [
        '@convex-dev/better-auth/client/plugins',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'better-auth/vue',
        'convex/browser',
        'convex/server',
        'convex/values',
        'zod',
      ],
    },
  },
  convex: {
    url: convexUrl,
    siteUrl: convexSiteUrl,
    auth: {
      enabled: true,
    },
  },
})

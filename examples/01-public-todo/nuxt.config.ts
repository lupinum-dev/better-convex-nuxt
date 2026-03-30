/**
 * Why this file exists:
 * This is the smallest possible Nuxt config for a public-only Convex app.
 * Auth is explicitly disabled so readers can see the "no auth" baseline first.
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
    auth: false,
  },
})

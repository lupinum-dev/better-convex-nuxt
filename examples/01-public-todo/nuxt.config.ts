/**
 * Why this file exists:
 * This is the smallest possible Nuxt config for a public-only Convex app.
 * The app stays public because it never opts into auth-only features.
 */
export default defineNuxtConfig({
  modules: ['@lupinum/trellis', '@nuxt/ui'],
  css: ['~~/assets/css/main.css'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: false,
  },

  typescript: {
    strict: true,
  },

  trellis: {
    url: process.env.CONVEX_URL,
    auth: false,
  },
})

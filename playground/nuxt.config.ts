export default defineNuxtConfig({
  modules: ["../src/module"],

  pages: true,

  devtools: { enabled: true },

  compatibilityDate: "2026-02-26",

  routeRules: {},

  typescript: {
    strict: true,
  },

  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL,
    permissions: true, // Enable createPermissions
  },
});

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
    permissions: true,
  },
});

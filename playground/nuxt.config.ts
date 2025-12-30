export default defineNuxtConfig({
  modules: ['../src/module'],

  pages: true,

  devtools: { enabled: true },

  typescript: {
    strict: true,
  },

  convex: {
    url: process.env.CONVEX_URL,
    permissions: true, // Enable createPermissions
  },
})

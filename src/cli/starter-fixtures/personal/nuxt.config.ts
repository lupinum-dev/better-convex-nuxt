export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: process.env.CONVEX_URL,
    auth: true,

  },
})

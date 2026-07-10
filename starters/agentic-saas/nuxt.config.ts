export default {
  modules: ['better-convex-nuxt'],
  pages: true,
  devtools: { enabled: true },
  compatibilityDate: '2026-06-21',
  typescript: {
    strict: true,
  },
  vite: {
    optimizeDeps: {
      include: ['better-auth/client/plugins'],
    },
  },
  convex: {
    url:
      process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL,
    siteUrl:
      process.env.NUXT_PUBLIC_CONVEX_SITE_URL ??
      process.env.CONVEX_SITE_URL ??
      process.env.VITE_CONVEX_SITE_URL,
    auth: {},
  },
}

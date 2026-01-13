// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'better-convex-nuxt'
  ],

  devtools: {
    enabled: true
  },

  ssr: false,

  css: ['~/assets/css/main.css'],

  // Convex module configuration
  convex: {
    url: process.env.CONVEX_URL,
    // siteUrl auto-derives from CONVEX_URL (.convex.cloud -> .convex.site)
    // Do NOT set it to localhost - that causes self-request deadlock!
    permissions: true,

  },



  compatibilityDate: '2025-01-15',

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ],
      meta: [
        { name: 'apple-mobile-web-app-title', content: 'Better Convex Nuxt' }
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})

// https://nuxt.com/docs/api/configuration/nuxt-config
const siteUrl = (process.env.SITE_URL || 'https://better-convex-nuxt-demo.vercel.app/').replace(/\/$/, '') + '/'
const ogImageUrl = `${siteUrl}og-image.png`

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'better-convex-nuxt'
  ],

  devtools: {
    enabled: true
  },
  
  debug: true,
  
  ssr: false,

  css: ['~/assets/css/main.css'],

  site: { url: siteUrl, name: 'Better Convex Nuxt Demo' },

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
      htmlAttrs: {
        lang: 'en'
      },
      title: 'Real-time Nuxt apps with Convex.',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Full-featured Convex integration for Nuxt. Real-time queries with SSR, mutations with optimistic updates, authentication, and fine-grained permissions.' },
        { name: 'apple-mobile-web-app-title', content: 'Better Convex Nuxt' },
        { name: 'google-site-verification', content: 'mFA4hQqscVMdgB5EefYAjQxRZRBYMDJeJ7Rqbx76ewk' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Better Convex Nuxt' },
        { property: 'og:title', content: 'Real-time Nuxt apps with Convex.' },
        { property: 'og:description', content: 'Full-featured Convex integration for Nuxt. Real-time queries with SSR, mutations with optimistic updates, authentication, and fine-grained permissions.' },
        { property: 'og:image', content: ogImageUrl },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:url', content: siteUrl },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Real-time Nuxt apps with Convex.' },
        { name: 'twitter:description', content: 'Full-featured Convex integration for Nuxt. Real-time queries with SSR, mutations with optimistic updates, authentication, and fine-grained permissions.' },
        { name: 'twitter:image', content: ogImageUrl }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
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

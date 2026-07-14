// https://nuxt.com/docs/api/configuration/nuxt-config
const siteUrl = (process.env.SITE_URL || 'https://better-convex-nuxt.vercel.app').replace(/\/$/, '')

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxtjs/sitemap',
    '@nuxt/content',
    'nuxt-og-image',
    'nuxt-llms',
    '@vueuse/nuxt',
  ],

  devtools: {
    enabled: true,
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      title: 'Real-time Nuxt apps with Convex.',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Convex integration for Nuxt 4 with SSR-to-realtime queries, Better Auth, typed server calls, optimistic updates, and file uploads.',
        },
        { name: 'apple-mobile-web-app-title', content: 'Better Convex Nuxt' },
        {
          name: 'google-site-verification',
          content: 'mFA4hQqscVMdgB5EefYAjQxRZRBYMDJeJ7Rqbx76ewk',
        },
        { property: 'og:site_name', content: 'Better Convex Nuxt' },
        { property: 'og:title', content: 'Real-time Nuxt apps with Convex.' },
        {
          property: 'og:description',
          content:
            'Convex integration for Nuxt 4 with SSR-to-realtime queries, Better Auth, typed server calls, optimistic updates, and file uploads.',
        },
        { property: 'og:image', content: `${siteUrl}/og-image.png` },
        { property: 'og:url', content: siteUrl },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Real-time Nuxt apps with Convex.' },
        {
          name: 'twitter:description',
          content:
            'Convex integration for Nuxt 4 with SSR-to-realtime queries, Better Auth, typed server calls, optimistic updates, and file uploads.',
        },
        { name: 'twitter:image', content: `${siteUrl}/og-image.png` },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  site: { url: siteUrl, name: 'Better Convex Nuxt' },
  content: {
    build: {
      markdown: {
        toc: {
          searchDepth: 1,
        },
      },
    },
  },

  experimental: {
    asyncContext: true,
  },

  compatibilityDate: '2024-07-11',

  routeRules: {
    '/docs/guide/get-started': { redirect: '/docs/get-started/choose-your-path' },
    '/docs/guide/basics': { redirect: '/docs/get-started/first-realtime-page' },
    '/docs/guide/auth': { redirect: '/docs/get-started/add-authentication' },
    '/docs/guide/concepts': { redirect: '/docs/understand/mental-model' },
    '/docs/data-fetching/queries': { redirect: '/docs/build/queries/queries' },
    '/docs/data-fetching/pagination': { redirect: '/docs/build/queries/pagination' },
    '/docs/data-fetching/caching-reuse': { redirect: '/docs/build/queries/sharing-query-state' },
    '/docs/mutations/mutations': { redirect: '/docs/build/write-data/mutations' },
    '/docs/mutations/actions': { redirect: '/docs/build/write-data/actions' },
    '/docs/mutations/optimistic-updates': {
      redirect: '/docs/build/write-data/optimistic-updates',
    },
    '/docs/auth-security/authentication': { redirect: '/docs/build/authentication/overview' },
    '/docs/server-side/server-routes': { redirect: '/docs/build/server/server-routes' },
    '/docs/server-side/ssr-hydration': {
      redirect: '/docs/understand/ssr-hydration-realtime',
    },
    '/docs/advanced/connection-state': {
      redirect: '/docs/build/application-behavior/connection-state',
    },
    '/docs/advanced/error-handling': {
      redirect: '/docs/build/application-behavior/error-handling',
    },
    '/docs/advanced/file-storage': { redirect: '/docs/build/files/upload-files' },
    '/docs/advanced/logging': { redirect: '/docs/build/application-behavior/logging' },
    '/docs/advanced/module-config': { redirect: '/docs/reference/module-configuration' },
    '/docs/advanced/api-surface': { redirect: '/docs/reference/api-surface' },
  },

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true,
      autoSubfolderIndex: false,
    },
  },

  hooks: {
    'nitro:config': async (nitroConfig) => {
      // Prerender raw markdown routes for "Copy page" feature
      const { glob } = await import('tinyglobby')
      const files = await glob('content/docs/**/*.md', { cwd: import.meta.dirname })

      const rawRoutes = files.map((file) => {
        const path = file
          .replace('content/', '/')
          .replace(/\/\d+\./g, '/')
          .replace('.md', '')
        return `/raw${path}.md`
      })

      nitroConfig.prerender = nitroConfig.prerender || {}
      nitroConfig.prerender.routes = [...(nitroConfig.prerender.routes || []), ...rawRoutes]
    },
  },

  icon: {
    provider: 'iconify',
  },

  llms: {
    domain: siteUrl,
    title: 'Better Convex Nuxt',
    description:
      'Nuxt 4 module for Convex with SSR-to-realtime queries, Better Auth, typed server calls, optimistic updates, and file uploads.',
    full: {
      title: 'Better Convex Nuxt - Full Documentation',
      description:
        'Complete Better Convex Nuxt documentation including concepts, task guides, recipes, API reference, security, and operations.',
    },
    sections: [
      {
        title: 'Overview',
        description: 'Product fit, use cases, comparison, limitations, and trade-offs.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/docs/overview%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Understand',
        description:
          'Mental models for lifecycle, SSR, identity, ownership, errors, and boundaries.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/docs/understand%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Get Started',
        description: 'Install the module and build a realtime, authenticated application.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/docs/get-started%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Build',
        description:
          'Queries, writes, authentication, Nitro server calls, files, and application behavior.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/docs/build%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Recipes',
        description: 'Complete patterns that compose the library around application invariants.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/docs/recipes%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Reference',
        description: 'Composables, components, server APIs, errors, configuration, and exports.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/docs/reference%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Operations',
        description:
          'Environment, deployment, security, troubleshooting, migration, and compatibility.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/docs/operations%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
    ],
  },

  sitemap: {
    sources: ['/api/__sitemap__/urls'],
  },
})

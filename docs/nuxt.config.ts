// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxt/ui',
    '@nuxtjs/sitemap',
    '@nuxt/content',
    'nuxt-og-image',
    'nuxt-llms',
    '@nuxtjs/mcp-toolkit',
    '@vueuse/nuxt',
  ],

  devtools: {
    enabled: true,
  },

  site: {  url: 'https://better-convex-nuxt.vercel.app/',  name: 'Better Convex Nuxt'  }, 

  css: ['~/assets/css/main.css'],

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
      nitroConfig.prerender.routes = [
        ...(nitroConfig.prerender.routes || []),
        ...rawRoutes
      ]
    }
  },

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true,
      autoSubfolderIndex: false,
    },
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs',
      },
    },
  },

  icon: {
    provider: 'iconify',
  },

  llms: {
    domain: 'https://better-convex-nuxt.vercel.app/',
    title: 'Better Convex Nuxt',
    description:
      'Nuxt module for Convex with Better Auth - real-time queries, SSR, authentication, and fine-grained permissions.',
    full: {
      title: 'Better Convex Nuxt - Full Documentation',
      description:
        'Complete documentation for Better Convex Nuxt module including API reference, authentication, and permissions.',
    },
    sections: [
      {
        title: 'Getting Started',
        description: 'Installation, quick start guide, and core concepts.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/1.getting-started%' },
          { field: 'extension', operator: '=', value: 'md' }
        ],
      },
      {
        title: 'Data Fetching',
        description: 'How to use useConvexQuery, pagination, and caching strategies.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/2.data-fetching%' },
          { field: 'extension', operator: '=', value: 'md' }
        ],
      },
      {
        title: 'Mutations',
        description: 'Performing mutations, actions, and handling optimistic updates.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/3.mutations%' },
          { field: 'extension', operator: '=', value: 'md' }
        ],
      },
      {
        title: 'Authentication & Security',
        description: 'Setup guide for authentication, permissions, and role-based access.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/4.auth-security%' },
          { field: 'extension', operator: '=', value: 'md' }
        ],
      },
      {
        title: 'Server-Side Rendering',
        description: 'Using Convex with Nuxt server routes and SSR hydration.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/5.server-side%' },
          { field: 'extension', operator: '=', value: 'md' }
        ],
      },
      {
        title: 'Advanced',
        description: 'Connection state management, error handling, file storage, and logging.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/6.advanced%' },
          { field: 'extension', operator: '=', value: 'md' }
        ],
      },
      {
        title: 'Deployment',
        description: 'Guide for deploying your application to production.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/7.deployment%' },
          { field: 'extension', operator: '=', value: 'md' }
        ],
      },
    ],
  },

  mcp: {
    name: 'better-convex-nuxt',
  },
})
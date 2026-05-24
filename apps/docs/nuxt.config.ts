// https://nuxt.com/docs/api/configuration/nuxt-config
const siteUrl = process.env.SITE_URL || 'https://trellis.vercel.app/'

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
    '@vueuse/nuxt',
  ],

  devtools: {
    enabled: false,
  },

  css: ['~/assets/css/main.css'],

  site: { url: siteUrl, name: 'Trellis' },
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

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      title: 'The application layer for Nuxt + Convex.',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Build Nuxt apps on one protected backend model with SSR-aware data, auth, permissions, operations, observability, and agent-safe access.',
        },
        { name: 'apple-mobile-web-app-title', content: 'Trellis' },
        {
          name: 'google-site-verification',
          content: 'mFA4hQqscVMdgB5EefYAjQxRZRBYMDJeJ7Rqbx76ewk',
        },
        { property: 'og:site_name', content: 'Trellis' },
        { property: 'og:title', content: 'The application layer for Nuxt + Convex.' },
        {
          property: 'og:description',
          content:
            'Build Nuxt apps on one protected backend model with SSR-aware data, auth, permissions, operations, observability, and agent-safe access.',
        },
        { property: 'og:image', content: `${siteUrl}og-image.png` },
        { property: 'og:url', content: siteUrl },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'The application layer for Nuxt + Convex.' },
        {
          name: 'twitter:description',
          content:
            'Build Nuxt apps on one protected backend model with SSR-aware data, auth, permissions, operations, observability, and agent-safe access.',
        },
        { name: 'twitter:image', content: `${siteUrl}og-image.png` },
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
    domain: siteUrl,
    title: 'Trellis',
    description:
      'Nuxt application layer for Convex with auth, permissions, operations, observability, and MCP-ready backend access.',
    full: {
      title: 'Trellis - Full Documentation',
      description:
        'Complete documentation for Trellis including onboarding, concepts, guides, API reference, permissions, server usage, and MCP tooling.',
    },
    sections: [
      {
        title: 'Getting Started',
        description: 'Orientation, installation, and the first protected app path.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/1.getting-started%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Concepts',
        description: 'Cross-cutting mental models for the protected backend execution model.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/2.concepts%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Data Fetching',
        description: 'How to use useConvexQuery, pagination, and caching strategies.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/3.data-fetching%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Mutations',
        description: 'Performing mutations, actions, and handling optimistic updates.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/4.mutations%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Authentication & Security',
        description: 'Setup guide for authentication, route protection, and token management.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/5.auth-security%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'File Uploads',
        description: 'Single file uploads, multi-file queues, and storage URLs.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/6.file-uploads%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Server-Side',
        description: 'SSR, hydration, server routes, identity forwarding, and bridge surfaces.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/7.server-side%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Permissions',
        description: 'Role-based access control with backend-driven permission checks.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/8.permissions%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Observability',
        description: 'Semantic events, correlated execution, and debugging decision flows.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/9.observability%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Configuration',
        description:
          'Module options, environment variables, auth, permissions, and MCP configuration.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/10.configuration%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Deployment',
        description: 'Guide for deploying your application to production.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/11.deployment%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Testing',
        description: 'Testing protected handlers, server helpers, and MCP-backed flows.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/12.testing%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'API Reference',
        description:
          'Meaning-bearing reference for composables, components, runtime functions, server helpers, and MCP surfaces.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/13.api-reference%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'MCP Tools',
        description: 'Expose the protected backend model safely to agent callers.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/14.mcp-tools%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
      {
        title: 'Project',
        description: 'Examples, changelog, migration guides, and contributor entry points.',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '%/15.project%' },
          { field: 'extension', operator: '=', value: 'md' },
        ],
      },
    ],
  },

  sitemap: {
    sources: ['/api/__sitemap__/urls'],
  },
})

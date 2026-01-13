export default defineNuxtConfig({
  ssr: false,
  srcDir: '.',
  devtools: { enabled: false },

  app: {
    baseURL: '/__convex_devtools__',
    head: {
      title: 'Convex DevTools',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      ],
    },
  },

  css: ['~/assets/styles.css'],

  typescript: {
    strict: true,
  },

  build: {
    transpile: [],
  },

  nitro: {
    preset: 'static',
    output: {
      dir: '../.output',
      publicDir: '../.output/public',
    },
  },

  compatibilityDate: '2025-01-01',
})

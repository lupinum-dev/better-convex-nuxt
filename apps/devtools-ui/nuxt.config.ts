import { createResolver } from '@nuxt/kit'

import { DEVTOOLS_UI_PATH, DEVTOOLS_UI_PORT } from '../../src/runtime/devtools/constants'

const resolver = createResolver(import.meta.url)

export default defineNuxtConfig({
  ssr: false,
  devtools: {
    enabled: false,
  },
  modules: ['@nuxt/devtools-ui-kit'],
  app: {
    baseURL: DEVTOOLS_UI_PATH,
  },
  compatibilityDate: '2024-08-19',
  // @ts-expect-error Nuxt accepts nitro here, but this bare config type loses the key.
  nitro: {
    output: {
      publicDir: resolver.resolve('../../dist/client'),
    },
  },
  vite: {
    server: {
      strictPort: true,
      hmr: {
        port: process.env.PORT ? +process.env.PORT : DEVTOOLS_UI_PORT,
        clientPort: process.env.PORT ? +process.env.PORT : DEVTOOLS_UI_PORT,
      },
    },
  },
  unocss: {
    icons: true,
    shortcuts: {
      'bg-base': 'bg-white dark:bg-[#151515]',
      'text-base': 'text-[#151515] dark:text-white',
      'bg-active': 'bg-gray:5',
      'bg-hover': 'bg-gray:3',
      'border-base': 'border-gray/20',
      'glass-effect': 'backdrop-blur-6 bg-white/80 dark:bg-[#151515]/90',
      'navbar-glass': 'sticky z-10 top-0 glass-effect',
    },
  },
})

import { fileURLToPath } from 'node:url'

import { trellisObservability } from './observability.config'

const runtimeFunctionsEntry = fileURLToPath(
  new URL('../../src/runtime/functions/index.ts', import.meta.url),
)

export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  css: ['~/assets/css/main.css'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: true,
  },

  alias: {
    '@lupinum/trellis/functions': runtimeFunctionsEntry,
  },

  typescript: {
    strict: true,
  },

  trellis: {
    url: process.env.CONVEX_URL,
    auth: {
      enabled: true,
    },
    observability: trellisObservability,
  },
})

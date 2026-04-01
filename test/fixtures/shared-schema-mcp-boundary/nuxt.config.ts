import { fileURLToPath } from 'node:url'

const moduleEntry = fileURLToPath(new URL('../../../src/module.ts', import.meta.url))
const runtimeComposablesEntry = fileURLToPath(
  new URL('../../../src/runtime/composables/index.ts', import.meta.url),
)
const runtimeArgsEntry = fileURLToPath(
  new URL('../../../src/runtime/args/index.ts', import.meta.url),
)
const runtimeMcpEntry = fileURLToPath(new URL('../../../src/runtime/mcp/index.ts', import.meta.url))
const runtimeServerEntry = fileURLToPath(
  new URL('../../../src/runtime/server/index.ts', import.meta.url),
)

export default defineNuxtConfig({
  modules: [moduleEntry, '@nuxtjs/mcp-toolkit'],

  alias: {
    'better-convex-nuxt/composables': runtimeComposablesEntry,
    'better-convex-nuxt/args': runtimeArgsEntry,
    'better-convex-nuxt/mcp': runtimeMcpEntry,
    'better-convex-nuxt/server': runtimeServerEntry,
  },

  nitro: {
    experimental: { asyncContext: true },
  },

  convex: {
    url: 'https://shared-schema-smoke.convex.cloud',
    siteUrl: 'https://shared-schema-smoke.convex.site',
  },
})

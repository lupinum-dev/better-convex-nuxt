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
    '@lupinum/trellis/composables': runtimeComposablesEntry,
    '@lupinum/trellis/args': runtimeArgsEntry,
    '@lupinum/trellis/mcp': runtimeMcpEntry,
    '@lupinum/trellis/server': runtimeServerEntry,
  },

  // @ts-expect-error Nuxt accepts nitro here, but this bare fixture config loses the key.
  nitro: {
    experimental: { asyncContext: true },
  },

  trellis: {
    url: 'https://shared-schema-smoke.convex.cloud',
  },
})

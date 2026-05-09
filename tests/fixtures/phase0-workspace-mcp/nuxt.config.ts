import { fileURLToPath } from 'node:url'

const moduleEntry = fileURLToPath(new URL('../../../src/module.ts', import.meta.url))
const runtimeMcpEntry = fileURLToPath(new URL('../../../src/runtime/mcp/index.ts', import.meta.url))

export default defineNuxtConfig({
  modules: [moduleEntry, '@nuxtjs/mcp-toolkit'],

  alias: {
    '@lupinum/trellis/mcp': runtimeMcpEntry,
  },

  nitro: {
    experimental: { asyncContext: true },
  },

  mcp: {
    name: 'phase0-workspace-mcp',
  },

  trellis: {
    url: 'https://phase0-workspace-mcp.convex.cloud',
  },
})

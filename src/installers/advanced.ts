import type { createResolver } from '@nuxt/kit'
import { addTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

interface InstallAdvancedOptions {
  nuxt: Nuxt
  resolver: ReturnType<typeof createResolver>
}

export function installAdvancedTrellis(options: InstallAdvancedOptions): void {
  const { nuxt, resolver } = options

  const serverAliasTemplate = addTemplate({
    filename: 'trellis/server.ts',
    write: true,
    getContents: () => `
export * from '${resolver.resolve('./runtime/server/index')}'
`,
  })

  nuxt.options.alias['#trellis/server'] = serverAliasTemplate.dst

  const mcpAliasTemplate = addTemplate({
    filename: 'trellis/mcp.ts',
    write: true,
    getContents: () => {
      const mcpEntryPath = resolver.resolve('./runtime/mcp/index')
      return `
export * from '${mcpEntryPath}'
`
    },
  })

  nuxt.options.alias['#trellis/mcp'] = mcpAliasTemplate.dst

  const mcpAdvancedAliasTemplate = addTemplate({
    filename: 'trellis/mcp-advanced.ts',
    write: true,
    getContents: () => {
      const advancedEntryPath = resolver.resolve('./runtime/mcp/advanced')
      return `
export * from '${advancedEntryPath}'
`
    },
  })

  nuxt.options.alias['#trellis/mcp/advanced'] = mcpAdvancedAliasTemplate.dst
}

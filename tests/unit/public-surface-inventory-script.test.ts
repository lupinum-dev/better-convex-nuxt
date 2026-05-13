import { describe, expect, it } from 'vitest'

import { collectRepoPublicSurfaceInventory } from '../../scripts/lib/public-surface-inventory.mjs'

describe('repo public-surface inventory script helper', () => {
  it('collects package, generated, CLI, starter, and stale-reference facts', () => {
    const inventory = collectRepoPublicSurfaceInventory(process.cwd())

    expect(inventory.packageExports).toContain('./backend')
    expect(inventory.generatedNuxtSurface.aliases).toContain('#trellis/api')
    expect(inventory.generatedNuxtSurface.autoImports).toContainEqual({
      layer: 'core',
      name: 'useConvexQuery',
    })
    expect(inventory.generatedNuxtSurface.serverImports).toContain('serverConvexQuery')
    expect(inventory.generatedNuxtSurface.authComponents).toContain('ConvexAuthenticated')
    expect(inventory.cli.commands).toEqual(expect.arrayContaining(['doctor', 'upgrade']))
    expect(inventory.cli.initTemplates).toContain('workspace-mcp')
    expect(inventory.cli.initTemplates).not.toContain('cms')
    expect(inventory.staleReferences.docsMatches.length).toBeGreaterThan(0)
  })

  it('keeps helper output JSON-friendly and snippet-free', () => {
    const inventory = collectRepoPublicSurfaceInventory(process.cwd())
    const serialized = JSON.stringify(inventory)

    expect(() => JSON.parse(serialized)).not.toThrow()
    expect(serialized).not.toContain('CONVEX_IDENTITY_FORWARDING_KEY=')
    expect(serialized).not.toContain('export default')
    expect(serialized).not.toContain('defineNuxtConfig')
  })
})

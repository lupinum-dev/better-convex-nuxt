import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('package subpath exports', () => {
  it('publishes the current package subpaths', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

    expect(packageJson.exports).toHaveProperty('./auth')
    expect(packageJson.exports).toHaveProperty('./args')
    expect(packageJson.exports).toHaveProperty('./backend')
    expect(packageJson.exports).toHaveProperty('./composables')
    expect(packageJson.exports).toHaveProperty('./feature')
    expect(packageJson.exports).toHaveProperty('./mcp')
    expect(packageJson.exports).toHaveProperty('./trusted-forwarding')
    expect(packageJson.exports).toHaveProperty('./testing')
    expect(packageJson.exports).toHaveProperty('./type-primitives')
    expect(packageJson.exports).toHaveProperty('./visibility')
    expect(packageJson.exports).not.toHaveProperty('./actor')
    expect(packageJson.exports).not.toHaveProperty('./convex')
    expect(packageJson.exports).not.toHaveProperty('./functions')
    expect(packageJson.exports).not.toHaveProperty('./bridge')
    expect(packageJson.exports).not.toHaveProperty('./service')
    expect(packageJson.exports).not.toHaveProperty('./scoping')
    expect(packageJson.exports).not.toHaveProperty('./schema')
    expect(packageJson.typesVersions['*']).toHaveProperty('args')
    expect(packageJson.typesVersions['*']).toHaveProperty('auth')
    expect(packageJson.typesVersions['*']).toHaveProperty('backend')
    expect(packageJson.typesVersions['*']).toHaveProperty('composables')
    expect(packageJson.typesVersions['*']).toHaveProperty('feature')
    expect(packageJson.typesVersions['*']).toHaveProperty('mcp')
    expect(packageJson.typesVersions['*']).toHaveProperty('trusted-forwarding')
    expect(packageJson.typesVersions['*']).toHaveProperty('testing')
    expect(packageJson.typesVersions['*']).toHaveProperty('type-primitives')
    expect(packageJson.typesVersions['*']).toHaveProperty('visibility')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('actor')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('convex')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('functions')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('bridge')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('service')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('scoping')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('schema')
  })

  it('maps runtime subpath imports to built ESM entry files', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

    expect(packageJson.exports['./auth'].import).toBe('./dist/runtime/auth/index.mjs')
    expect(packageJson.exports['./args'].import).toBe('./dist/runtime/args/index.mjs')
    expect(packageJson.exports['./backend'].import).toBe('./dist/runtime/backend/index.js')
    expect(packageJson.exports['./composables'].import).toBe('./dist/runtime/composables/index.mjs')
    expect(packageJson.exports['./feature'].import).toBe('./dist/runtime/feature/index.js')
    expect(packageJson.exports['./mcp'].import).toBe('./dist/runtime/mcp/index.mjs')
    expect(packageJson.exports['./trusted-forwarding'].import).toBe(
      './dist/runtime/trusted-forwarding/index.js',
    )
    expect(packageJson.exports['./visibility'].import).toBe('./dist/runtime/visibility/index.mjs')
    expect(packageJson.exports['./server'].import).toBe('./dist/runtime/server/index.mjs')
    expect(packageJson.exports['./testing'].import).toBe('./dist/runtime/testing/index.mjs')
    expect(packageJson.exports['./type-primitives'].import).toBe(
      './dist/runtime/type-primitives/index.js',
    )
  })

  it('does not keep test aliases for deleted public subpaths', () => {
    const vitestConfig = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf8')

    expect(vitestConfig).not.toContain("'@lupinum/trellis/functions':")
    expect(vitestConfig).not.toContain('"@lupinum/trellis/functions":')
    expect(vitestConfig).not.toContain("'@lupinum/trellis/bridge':")
    expect(vitestConfig).not.toContain('"@lupinum/trellis/bridge":')
  })
})

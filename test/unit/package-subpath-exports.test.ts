import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('package subpath exports', () => {
  it('publishes the v3 subpaths', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

    expect(packageJson.exports).toHaveProperty('./auth')
    expect(packageJson.exports).toHaveProperty('./args')
    expect(packageJson.exports).toHaveProperty('./composables')
    expect(packageJson.exports).toHaveProperty('./mcp')
    expect(packageJson.exports).toHaveProperty('./service')
    expect(packageJson.exports).toHaveProperty('./testing')
    expect(packageJson.exports).toHaveProperty('./visibility')
    expect(packageJson.exports).not.toHaveProperty('./actor')
    expect(packageJson.exports).not.toHaveProperty('./convex')
    expect(packageJson.exports).not.toHaveProperty('./scoping')
    expect(packageJson.exports).not.toHaveProperty('./schema')
    expect(packageJson.typesVersions['*']).toHaveProperty('args')
    expect(packageJson.typesVersions['*']).toHaveProperty('auth')
    expect(packageJson.typesVersions['*']).toHaveProperty('composables')
    expect(packageJson.typesVersions['*']).toHaveProperty('mcp')
    expect(packageJson.typesVersions['*']).toHaveProperty('service')
    expect(packageJson.typesVersions['*']).toHaveProperty('testing')
    expect(packageJson.typesVersions['*']).toHaveProperty('visibility')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('actor')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('convex')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('scoping')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('schema')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('package subpath exports', () => {
  it('publishes the V2 subpaths', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

    expect(packageJson.exports).toHaveProperty('./convex')
    expect(packageJson.exports).toHaveProperty('./mcp')
    expect(packageJson.exports).toHaveProperty('./schema')
    expect(packageJson.exports).not.toHaveProperty('./actor')
    expect(packageJson.exports).not.toHaveProperty('./scoping')
    expect(packageJson.typesVersions['*']).toHaveProperty('convex')
    expect(packageJson.typesVersions['*']).toHaveProperty('mcp')
    expect(packageJson.typesVersions['*']).toHaveProperty('schema')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('actor')
    expect(packageJson.typesVersions['*']).not.toHaveProperty('scoping')
  })
})

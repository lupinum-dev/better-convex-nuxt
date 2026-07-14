import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')

describe('supported version alignment', () => {
  it('advertises the same Nuxt range in package, module, and security contracts', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      peerDependencies: { nuxt: string }
    }
    const moduleSource = readFileSync(join(root, 'src/module.ts'), 'utf8')
    const securityContract = readFileSync(join(root, 'SECURITY.md'), 'utf8')

    expect(manifest.peerDependencies.nuxt).toBe('^4.4.0')
    expect(moduleSource).toContain("nuxt: '^4.4.0'")
    expect(securityContract).toContain('Nuxt `^4.4.0`')
  })

  it('keeps stateful auth and Convex runtimes on one consumer-owned peer tuple', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies: Record<string, string>
      peerDependencies: Record<string, string>
    }
    const supportedPeers = {
      '@convex-dev/better-auth': '0.12.5',
      'better-auth': '1.6.23',
      convex: '1.42.1',
    }

    for (const [name, version] of Object.entries(supportedPeers)) {
      expect(manifest.peerDependencies[name]).toBe(version)
      expect(manifest.devDependencies[name]).toBe(version)
      expect(manifest.dependencies?.[name]).toBeUndefined()
    }
  })
})

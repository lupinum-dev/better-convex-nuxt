import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

type StarterManifest = {
  name: string
  include: string[]
  exclude: string[]
  generated?: { path: string }[]
}

const fixtureRoot = resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp')
const manifestPath = join(fixtureRoot, 'starter.manifest.json')

function matchesPattern(path: string, pattern: string): boolean {
  const deepFileMatch = pattern.match(/^(.+)\/\*\*\/\*(\.[^/]+)$/)
  if (deepFileMatch) {
    const [, prefix, suffix] = deepFileMatch
    return path.startsWith(`${prefix}/`) && path.endsWith(suffix)
  }

  if (pattern.endsWith('/**')) {
    return path.startsWith(pattern.slice(0, -3))
  }

  return path === pattern
}

function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern))
}

function toFixturePath(path: string): string {
  return relative(fixtureRoot, path).split(sep).join('/')
}

describe('phase0 workspace-mcp starter manifest', () => {
  it('keeps generated starter inputs explicit and excludes local runtime artifacts', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as StarterManifest

    const selected = [
      '.gitignore',
      'app.vue',
      'convex.json',
      'convex/_generated/api.d.ts',
      'convex/_generated/api.js',
      'convex/_generated/dataModel.d.ts',
      'convex/_generated/server.d.ts',
      'convex/_generated/server.js',
      'convex/features/projects/domain.ts',
      'convex/schema.ts',
      'generated/mcp-tool-refs.ts',
      'generated/operation-refs.ts',
      'nuxt.config.ts',
      'package.json',
      'server/mcp/tools/create-project.ts',
      'server/mcp/tools/delete-project.ts',
      'shared/app-inventory.ts',
      'shared/features/projects/tools.ts',
    ]

    for (const path of selected) {
      expect(existsSync(join(fixtureRoot, path)), path).toBe(true)
      expect(matchesAny(path, manifest.include), path).toBe(true)
      expect(matchesAny(path, manifest.exclude), path).toBe(false)
    }

    for (const localPath of ['.env.local', '.convex/local/default/config.json']) {
      expect(matchesAny(localPath, manifest.exclude), localPath).toBe(true)
    }

    expect(manifest.include).not.toContain('.env.local')
    expect(manifest.include).not.toContain('.nuxt/**')
    expect(manifest.include).not.toContain('.output/**')

    expect(manifest.generated?.map((file) => file.path)).toEqual([
      'generated/operation-refs.ts',
      'generated/mcp-tool-refs.ts',
    ])
    expect(toFixturePath(manifestPath)).toBe('starter.manifest.json')
  })
})

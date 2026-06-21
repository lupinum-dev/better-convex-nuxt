import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '../..')

const appOwnedOrganizationStarters = ['team', 'agency', 'vertical-ai', 'mcp-agent'] as const

function readStarterFile(starter: string, path: string): string {
  return readFileSync(join(repoRoot, 'starters', starter, path), 'utf8')
}

describe('starter organization ownership', () => {
  it.each(appOwnedOrganizationStarters)(
    '%s keeps app-owned organizations separate from Better Auth Organization',
    (starter) => {
      const schema = readStarterFile(starter, 'convex/schema.ts')
      const readme = readStarterFile(starter, 'README.md')
      const auth = tryReadStarterAuth(starter)

      expect(schema).toContain('organizations: defineTable')
      expect(schema).toContain('memberships: defineTable')
      expect(readme).toContain('app-owned Convex')
      expect(readme).toMatch(/does not enable the Better Auth Organization\s+plugin/)
      expect(auth).not.toMatch(/\borganization\s*\(/)
      expect(auth).not.toContain("from 'better-auth/plugins'")
    },
  )
})

function tryReadStarterAuth(starter: string): string {
  try {
    return readStarterFile(starter, 'convex/auth.ts')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return ''
    }
    throw error
  }
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '../..')

const appOwnedOrganizationStarters = ['agency', 'vertical-ai', 'mcp-agent'] as const

function readStarterFile(starter: string, path: string): string {
  return readFileSync(join(repoRoot, 'starters', starter, path), 'utf8')
}

describe('starter organization ownership', () => {
  it('team uses Better Auth Organization as the organization source of truth', () => {
    const schema = readStarterFile('team', 'convex/schema.ts')
    const readme = readStarterFile('team', 'README.md')
    const auth = readStarterFile('team', 'convex/auth.ts')
    const organizationCreateForm = readStarterFile(
      'team',
      'app/components/OrganizationCreateForm.vue',
    )
    const organizationWorkspace = readStarterFile(
      'team',
      'app/components/OrganizationWorkspace.vue',
    )
    const projects = readStarterFile('team', 'convex/projects.ts')

    expect(schema).not.toContain('organizations: defineTable')
    expect(schema).not.toContain('memberships: defineTable')
    expect(schema).not.toContain('invitations: defineTable')
    expect(schema).not.toContain('pluginProjects: defineTable')
    expect(schema).not.toContain('pluginAuditEvents: defineTable')
    expect(schema).toContain('projects: defineTable')
    expect(schema).toContain('auditEvents: defineTable')
    expect(schema).toContain('organizationId: v.string()')
    expect(schema).toContain('createdByAuthUserId: v.string()')
    expect(schema).toContain('actorAuthUserId: v.string()')
    expect(readme).toContain('Better Auth Organization plugin')
    expect(readme).toMatch(
      /canonical organization,\s+member,\s+invitation,\s+team,\s+and role\s+state/,
    )
    expect(auth).toMatch(/\borganization\s*\(/)
    expect(auth).toContain("from 'better-auth/plugins'")
    expect(organizationCreateForm).toContain('authClient.organization.create')
    expect(organizationCreateForm).not.toContain('api.organizations.create')
    expect(organizationWorkspace).toContain('useTeamOrganizations')
    expect(organizationWorkspace).not.toContain('api.organizations.listMine')
    expect(projects).toContain('auth.api.hasPermission')
    expect(projects).toContain("query('projects')")
    expect(projects).toContain("insert('projects'")
    expect(projects).toContain("insert('auditEvents'")
    expect(projects).not.toContain('requireOrgAccess')
  })

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

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  applyInitTemplateSet,
  getAddTemplateSet,
  getCanonicalAppTemplateSet,
} from '../../src/cli/lib/init'

const tempDirs: string[] = []

async function createTempAppRoot(prefix: string) {
  const cwd = await mkdtemp(resolve(tmpdir(), `trellis-${prefix}-`))
  tempDirs.push(cwd)
  return cwd
}

async function scaffoldApp(template: 'personal' | 'workspace' | 'cms', mcp = false) {
  const cwd = await createTempAppRoot(`${template}${mcp ? '-mcp' : ''}`)
  const initTemplate = getCanonicalAppTemplateSet({
    appName: 'demo-app',
    template,
    mcp,
  })
  await applyInitTemplateSet(cwd, initTemplate, false)
  return cwd
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })))
})

describe('trellis add resource', () => {
  it('scaffolds a personal resource slice and patches the schema + permission context', async () => {
    const cwd = await scaffoldApp('personal')
    const template = await getAddTemplateSet({
      feature: 'resource',
      cwd,
      name: 'project',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(readFile(resolve(cwd, 'shared/schemas/project.ts'), 'utf8')).resolves.toContain(
      'export const createProject = defineArgs',
    )
    await expect(readFile(resolve(cwd, 'convex/domain/project.ts'), 'utf8')).resolves.toContain(
      "export const update = mutation({",
    )
    await expect(readFile(resolve(cwd, 'convex/schema.ts'), 'utf8')).resolves.toContain(
      "projects: defineTable({",
    )
    await expect(
      readFile(resolve(cwd, 'convex/auth/permissions.ts'), 'utf8'),
    ).resolves.toContain('...projectPermissions,')
    await expect(
      readFile(resolve(cwd, 'convex/auth/permissions.ts'), 'utf8'),
    ).resolves.toContain("check: isAuthenticated")
  })

  it('scaffolds a workspace resource slice that follows tenant conventions', async () => {
    const cwd = await scaffoldApp('workspace')
    const template = await getAddTemplateSet({
      feature: 'resource',
      cwd,
      name: 'project',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(readFile(resolve(cwd, 'convex/schema.ts'), 'utf8')).resolves.toContain(
      "workspaceId: v.id('workspaces')",
    )
    await expect(readFile(resolve(cwd, 'convex/domain/project.ts'), 'utf8')).resolves.toContain(
      ".withIndex('by_workspace'",
    )
    await expect(
      readFile(resolve(cwd, 'convex/auth/permissions.ts'), 'utf8'),
    ).resolves.toContain("check: hasWorkspace.and(hasMinimumRole('member'))")
    await expect(readFile(resolve(cwd, 'convex/project.test.ts'), 'utf8')).resolves.toContain(
      'seedTenant',
    )
  })

  it('adds MCP-facing resource files and runtime capabilities when MCP is enabled', async () => {
    const cwd = await scaffoldApp('workspace', true)
    const template = await getAddTemplateSet({
      feature: 'resource',
      cwd,
      name: 'project',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(readFile(resolve(cwd, 'convex/operations/project.ts'), 'utf8')).resolves.toContain(
      'removeProjectOp',
    )
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).resolves.toContain('permission: projectDeletePermission')
    await expect(readFile(resolve(cwd, 'server/mcp/runtime.ts'), 'utf8')).resolves.toContain(
      'api.permissions.context.getPermissionContext',
    )
  })

  it('scaffolds a cms resource slice with the existing author convention', async () => {
    const cwd = await scaffoldApp('cms')
    const template = await getAddTemplateSet({
      feature: 'resource',
      cwd,
      name: 'entry',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(readFile(resolve(cwd, 'convex/schema.ts'), 'utf8')).resolves.toContain(
      'authorId: v.string()',
    )
    await expect(readFile(resolve(cwd, 'convex/domain/entry.ts'), 'utf8')).resolves.toContain(
      'loaded.authorId === actor.userId',
    )
  })
})

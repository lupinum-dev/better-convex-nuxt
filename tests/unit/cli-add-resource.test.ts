import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  applyInitTemplateSet,
  getAddTemplateSet,
  getCanonicalAppTemplateSet,
} from '../../src/cli/lib/init'
import { renderAddFixture, renderAppStarterFixtureSubset } from '../../src/cli/lib/starter-fixtures'

const tempDirs: string[] = []

async function createTempAppRoot(prefix: string) {
  const cwd = await mkdtemp(resolve(tmpdir(), `trellis-${prefix}-`))
  tempDirs.push(cwd)
  return cwd
}

async function scaffoldApp(template: 'personal' | 'workspace', mcp = false) {
  const cwd = await createTempAppRoot(`${template}${mcp ? '-mcp' : ''}`)
  const initTemplate = getCanonicalAppTemplateSet({
    appName: 'demo-app',
    template,
    mcp,
  })
  await applyInitTemplateSet(cwd, initTemplate, false)
  return cwd
}

async function scaffoldAuthorOwnedResourceApp() {
  const cwd = await createTempAppRoot('author-owned-resource')
  await mkdir(resolve(cwd, 'convex/features/pages'), { recursive: true })
  await mkdir(resolve(cwd, 'convex/features/users'), { recursive: true })

  await writeFile(
    resolve(cwd, 'convex/schema.ts'),
    `
import { defineSchema } from 'convex/server'

import { pagesTables } from './features/pages'
import { userTables } from './features/users'

export default defineSchema({
  ...userTables,
  ...pagesTables,
})
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/index.ts'),
    `
import { composeFeatures } from '@lupinum/trellis/workspace'

import { pagesFeature } from './pages/feature'
import { usersFeature } from './users/feature'

const manifest = composeFeatures([usersFeature, pagesFeature])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const sharedTables = manifest.sharedTables
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/pages/domain.ts'),
    `
import { query } from '../../functions'

export const listPublished = query.public({
  args: {},
  handler: async () => [],
})
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/pages/feature.ts'),
    `
export const pagesFeature = {
  name: 'pages',
}
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/pages/index.ts'),
    `
export { pagesFeature } from './feature'
export { pagesTables } from './schema'
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/pages/schema.ts'),
    `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const pagesTables = {
  pages: defineTable({
    authorId: v.string(),
  }).index('by_author', ['authorId']),
}
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/users/feature.ts'),
    `
export const usersFeature = {
  name: 'users',
}
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/users/index.ts'),
    `
export { usersFeature } from './feature'
export { userTables } from './schema'
`.trimStart(),
  )
  await writeFile(
    resolve(cwd, 'convex/features/users/schema.ts'),
    `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const userTables = {
  users: defineTable({
    authKey: v.string(),
  }).index('by_auth_key', ['authKey']),
}
`.trimStart(),
  )

  return cwd
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })))
})

describe('trellis add entity', () => {
  it('scaffolds a personal resource slice and patches the schema + access context', async () => {
    const cwd = await scaffoldApp('personal')
    const template = await getAddTemplateSet({
      feature: 'entity',
      cwd,
      name: 'project',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(
      readFile(resolve(cwd, 'shared/features/projects/contract.ts'), 'utf8'),
    ).resolves.toContain('export const createProject = defineArgs')
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/domain.ts'), 'utf8'),
    ).resolves.toContain('export const update = mutation.protected({')
    await expect(readFile(resolve(cwd, 'convex/schema.ts'), 'utf8')).resolves.toContain(
      "import { projectsTables } from './features/projects'",
    )
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/permissions.ts'), 'utf8'),
    ).resolves.toContain('export const projectReadPermission = definePermission')
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/permissions.ts'), 'utf8'),
    ).resolves.toContain('check: isAuthenticated')
  })

  it('scaffolds a workspace resource slice that follows tenant conventions', async () => {
    const cwd = await scaffoldApp('workspace')
    const template = await getAddTemplateSet({
      feature: 'entity',
      cwd,
      name: 'project',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(readFile(resolve(cwd, 'convex/schema.ts'), 'utf8')).resolves.toContain(
      "import { projectsTables } from './features/projects'",
    )
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/schema.ts'), 'utf8'),
    ).resolves.toContain("workspaceId: v.id('workspaces')")
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/domain.ts'), 'utf8'),
    ).resolves.toContain(".withIndex('by_workspace'")
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/permissions.ts'), 'utf8'),
    ).resolves.toContain("check: hasWorkspace.and(hasMinimumRole('member'))")
    await expect(readFile(resolve(cwd, 'convex/features/index.ts'), 'utf8')).resolves.toContain(
      "import { projectsFeature } from './projects/feature'",
    )
    await expect(readFile(resolve(cwd, 'convex/features/index.ts'), 'utf8')).resolves.toContain(
      'composeFeatures([workspacesFeature, usersFeature, todosFeature, projectsFeature])',
    )
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/tests.ts'), 'utf8'),
    ).resolves.toContain('seedTenant')
    await expect(
      readFile(resolve(cwd, 'shared/features/projects/contract.ts'), 'utf8'),
    ).resolves.toContain("id: v.id('projects')")
  })

  it('adds MCP-facing resource files and runtime recordAccess when MCP is enabled', async () => {
    const cwd = await scaffoldApp('workspace', true)
    const template = await getAddTemplateSet({
      feature: 'entity',
      cwd,
      name: 'project',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(
      readFile(resolve(cwd, 'convex/features/projects/operations.ts'), 'utf8'),
    ).resolves.toContain('removeProjectOp')
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).resolves.toContain('removeProjectDescriptor')
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).resolves.toContain('api.features.projects.domain.remove')
    await expect(
      readFile(resolve(cwd, 'convex/features/projects/feature.ts'), 'utf8'),
    ).resolves.toContain('operations: [removeProjectDescriptor]')
    await expect(
      readFile(resolve(cwd, 'shared/features/projects/contract.ts'), 'utf8'),
    ).resolves.toContain("permission: 'project.delete'")
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).not.resolves.toContain('permission: projectDeletePermission')
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).not.resolves.toContain("from '~~/convex/features/projects/operations'")
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).not.resolves.toContain("from '~~/convex/features/projects/domain'")
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).not.resolves.toContain("from '~~/convex/features/projects/permissions'")
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).resolves.toContain('api.features.projects.operations.previewRemoveProject')
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).not.resolves.toContain('functionRef:')
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/create-project.ts'), 'utf8'),
    ).resolves.toContain('~~/shared/features/projects/contract')
    await expect(readFile(resolve(cwd, 'server/mcp/runtime.ts'), 'utf8')).resolves.toContain(
      'api.permissions.context.getAccessContext',
    )
  })

  it('scaffolds an author-owned resource slice with the existing author convention', async () => {
    const cwd = await scaffoldAuthorOwnedResourceApp()

    const template = await getAddTemplateSet({
      feature: 'entity',
      cwd,
      name: 'entry',
      appName: 'demo-app',
    })

    await applyInitTemplateSet(cwd, template, false)

    await expect(readFile(resolve(cwd, 'convex/schema.ts'), 'utf8')).resolves.toContain(
      "import { pagesTables } from './features/pages'",
    )
    await expect(
      readFile(resolve(cwd, 'convex/features/entries/domain.ts'), 'utf8'),
    ).resolves.toContain('loaded.authorId === appIdentity.userId')
    await expect(readFile(resolve(cwd, 'convex/features/index.ts'), 'utf8')).resolves.toContain(
      "import { entriesFeature } from './entries/feature'",
    )
    await expect(readFile(resolve(cwd, 'convex/features/index.ts'), 'utf8')).resolves.toContain(
      'composeFeatures([usersFeature, pagesFeature, entriesFeature])',
    )
    await expect(
      readFile(resolve(cwd, 'convex/features/entries/schema.ts'), 'utf8'),
    ).resolves.toContain('authorId: v.string()')
  })
})

describe('trellis add uploads', () => {
  it('scaffolds the canonical upload seam with a shared contract and explicit unsafe boundary', async () => {
    const cwd = await scaffoldApp('workspace')
    const template = await getAddTemplateSet({
      feature: 'uploads',
      cwd,
      appName: 'demo-app',
    })

    expect(template.files).toEqual(renderAddFixture({ fixture: 'uploads' }))

    await applyInitTemplateSet(cwd, template, false)

    await expect(
      readFile(resolve(cwd, 'shared/features/files/contract.ts'), 'utf8'),
    ).resolves.toContain('export const generateUploadUrl = defineArgs')
    await expect(
      readFile(resolve(cwd, 'convex/features/files/domain.ts'), 'utf8'),
    ).resolves.toContain('Why this file exists:')
    await expect(
      readFile(resolve(cwd, 'convex/features/files/domain.ts'), 'utf8'),
    ).resolves.toContain('args: generateUploadUrlContract.args')
    await expect(
      readFile(resolve(cwd, 'app/features/uploads/components/UploadsStarterPage.vue'), 'utf8'),
    ).resolves.toContain('useConvexUpload(api.features.files.domain.generateUploadUrlMutation')
    await expect(readFile(resolve(cwd, 'app/pages/uploads.vue'), 'utf8')).resolves.toContain(
      'UploadsStarterPage',
    )
  })
})

describe('trellis add mcp', () => {
  const mcpAddPaths = [
    'server/middleware/mcp-auth.ts',
    'server/mcp/index.ts',
    'server/mcp/runtime.ts',
    'server/mcp/tools/list-todos.ts',
    'server/mcp/tools/create-todo.ts',
    'convex/features/mcpKeys/domain.ts',
  ] as const

  it('derives authored MCP files from the workspace-mcp fixture', async () => {
    const cwd = await scaffoldApp('workspace')
    const template = await getAddTemplateSet({
      feature: 'mcp',
      cwd,
      appName: 'demo-app',
    })

    expect(template.files.map((file) => file.path)).toEqual([...mcpAddPaths])

    await applyInitTemplateSet(cwd, template, false)

    const expectedFiles = renderAppStarterFixtureSubset({
      appName: 'demo-app',
      template: 'workspace-mcp',
      paths: mcpAddPaths,
    })

    for (const expected of expectedFiles) {
      await expect(readFile(resolve(cwd, expected.path), 'utf8')).resolves.toBe(expected.content)
    }

    await expect(readFile(resolve(cwd, 'nuxt.config.ts'), 'utf8')).resolves.toContain(
      "mcp: { name: 'trellis-workspace-",
    )
    await expect(readFile(resolve(cwd, 'package.json'), 'utf8')).resolves.toContain(
      '"@nuxtjs/mcp-toolkit": "^0.16.1"',
    )
    await expect(readFile(resolve(cwd, 'convex/schema.ts'), 'utf8')).resolves.toContain(
      'mcpKeys: defineTable',
    )
  })
})

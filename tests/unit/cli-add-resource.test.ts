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

describe('trellis add entity', () => {
  it('scaffolds a personal resource slice and patches the schema + permission context', async () => {
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

  it('adds MCP-facing resource files and runtime capabilities when MCP is enabled', async () => {
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
    ).resolves.toContain('permission: projectDeletePermission')
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).resolves.toContain("functionRef: 'features/projects/domain:remove'")
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/delete-project.ts'), 'utf8'),
    ).resolves.toContain("functionRef: 'features/projects/operations:previewRemoveProject'")
    await expect(
      readFile(resolve(cwd, 'server/mcp/tools/create-project.ts'), 'utf8'),
    ).resolves.toContain('~~/shared/features/projects/contract')
    await expect(readFile(resolve(cwd, 'server/mcp/runtime.ts'), 'utf8')).resolves.toContain(
      'api.permissions.context.getPermissionContext',
    )
  })

  it('scaffolds a cms resource slice with the existing author convention', async () => {
    const cwd = await scaffoldApp('cms')

    await expect(
      readFile(resolve(cwd, 'convex/features/pages/domain.ts'), 'utf8'),
    ).resolves.toContain('export const listPublished = query({')
    await expect(
      readFile(resolve(cwd, 'convex/features/pages/permissions.ts'), 'utf8'),
    ).resolves.toContain('export const pageCreate = definePermission')
    await expect(
      readFile(resolve(cwd, 'app/features/cms/components/CmsStudioPage.vue'), 'utf8'),
    ).resolves.toContain('api.features.pages.domain.create')

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
    ).resolves.toContain('loaded.authorId === actor.userId')
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

describe('trellis init cms', () => {
  it('describes the cms starter as the simple public+studio baseline, not the component-boundary example', async () => {
    const cwd = await scaffoldApp('cms')

    await expect(readFile(resolve(cwd, 'README.md'), 'utf8')).resolves.toContain(
      'This starter is the simple public-site + signed-in studio baseline.',
    )
    await expect(readFile(resolve(cwd, 'README.md'), 'utf8')).resolves.toContain(
      'Use [`08-component-mini-cms`]',
    )
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

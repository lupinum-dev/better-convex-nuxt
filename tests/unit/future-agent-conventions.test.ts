import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = '/Users/matthias/Git/0_libs/WORK/trellis'

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

function file(relativePath: string) {
  return resolve(root, relativePath)
}

describe('future agent conventions', () => {
  it('keeps transport-neutral agent principals in canonical docs and examples', () => {
    const files = [
      'apps/docs/content/docs/08.permissions/2.caller-and-app-identity.md',
      'apps/docs/content/docs/08.permissions/8.advanced-caller-models.md',
      'examples/03-team-workspace/convex/auth/caller.ts',
      'examples/07-mcp-reference/convex/auth/caller.ts',
      'examples/08-component-mini-cms/shared/caller.ts',
    ]

    for (const file of files) {
      const content = read(file)
      expect(content).toContain("kind: 'agent'")
      expect(content).not.toContain("kind: 'mcp'")
      expect(content).not.toContain("case 'mcp'")
    }
  })

  it('states that transport visibility does not replace Convex business authorization', () => {
    const principalDocs = read('apps/docs/content/docs/08.permissions/2.caller-and-app-identity.md')
    const mcpTools = read('apps/docs/content/docs/14.mcp-tools/2.define-tools.md')

    expect(principalDocs).toContain("They still don't replace Convex business authorization")
    expect(mcpTools).toContain("It isn't business authorization")
    expect(mcpTools).toContain(
      'the protected Convex handler still owns the real permission decision',
    )
  })

  it('keeps root internal refs and bridge refs as the automation surface', () => {
    const bridgeDocs = read('apps/docs/content/docs/07.server-side/5.component-bridge.md')
    const mcpApi = read('apps/docs/content/docs/13.api-reference/5.mcp.md')
    const miniCmsReadme = read('examples/08-component-mini-cms/README.md')

    expect(bridgeDocs).toContain('stable automation seam')
    expect(mcpApi).toContain('project root handlers or bridge refs into the MCP runtime')
    expect(miniCmsReadme).toContain('internal bridge refs')
  })

  it('keeps the public advanced examples on the canonical app shape', () => {
    const canonicalExamples = [
      'examples/04-saas-platform',
      'examples/05-visibility-access',
      'examples/06-multi-workspace',
    ]

    const forbiddenFlatModules = [
      'convex/articles.ts',
      'convex/comments.ts',
      'convex/dashboard.ts',
      'convex/files.ts',
      'convex/knowledgeBases.ts',
      'convex/members.ts',
      'convex/projects.ts',
      'convex/tasks.ts',
      'convex/workspaces.ts',
    ]

    for (const example of canonicalExamples) {
      expect(existsSync(file(`${example}/convex/permissions/context.ts`))).toBe(true)
      expect(existsSync(file(`${example}/convex/features`))).toBe(true)

      const nuxtConfig = read(`${example}/nuxt.config.ts`)
      if (nuxtConfig.includes('trellis.permissions')) {
        expect(nuxtConfig).toContain("query: 'permissions/context.getAccessContext'")
      }

      for (const forbiddenFile of forbiddenFlatModules) {
        expect(existsSync(file(`${example}/${forbiddenFile}`))).toBe(false)
      }
    }

    expect(
      existsSync(file('examples/04-saas-platform/convex/features/projects/operations.ts')),
    ).toBe(true)
    expect(existsSync(file('examples/04-saas-platform/convex/features/tasks/operations.ts'))).toBe(
      true,
    )
    expect(
      existsSync(file('examples/05-visibility-access/convex/features/articles/operations.ts')),
    ).toBe(true)
  })

  it('keeps public canonical example tests free of blanket TypeScript suppression', () => {
    const canonicalTests = [
      'examples/04-saas-platform/convex/projectBoard.test.ts',
      'examples/05-visibility-access/convex/knowledgeBase.test.ts',
      'examples/06-multi-workspace/convex/agency.test.ts',
    ]

    for (const testFile of canonicalTests) {
      expect(read(testFile)).not.toContain('@ts-nocheck')
    }
  })
})

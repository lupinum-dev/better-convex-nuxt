import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = '/Users/matthias/Git/0_libs/WORK/trellis'

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

function listFiles(...relativeDirs: string[]) {
  const files: string[] = []

  function walk(relativeDir: string) {
    const absoluteDir = resolve(root, relativeDir)
    for (const entry of readdirSync(absoluteDir)) {
      const relativePath = `${relativeDir}/${entry}`
      const absolutePath = resolve(root, relativePath)
      const stat = statSync(absolutePath)
      if (stat.isDirectory()) {
        walk(relativePath)
        continue
      }
      files.push(relativePath)
    }
  }

  for (const relativeDir of relativeDirs) {
    walk(relativeDir)
  }

  return files
}

describe('schema boundary policy', () => {
  it('keeps backend and MCP code away from shared edge schemas', () => {
    const targets = [
      ...listFiles(
        'examples/01-public-todo/convex',
        'examples/02-auth-todo/convex',
        'examples/03-team-workspace/convex',
        'examples/04-saas-platform/convex',
        'examples/07-mcp-reference/convex',
        'examples/08-component-mini-cms/convex',
      ),
      ...listFiles(
        'examples/07-mcp-reference/server/mcp',
        'examples/08-component-mini-cms/server/mcp',
      ),
      'src/cli/lib/resource.ts',
      ...listFiles('src/cli/starter-fixtures/personal/convex'),
      ...listFiles('src/cli/starter-fixtures/workspace/convex'),
      ...listFiles('src/cli/starter-fixtures/workspace-mcp/convex'),
    ]

    const offenders = targets.filter((path) => /from ['"][^'"]*shared\/schemas\//.test(read(path)))

    expect(offenders).toEqual([])
  })

  it('keeps docs off the old shared-contract narrative', () => {
    const docs = [
      'apps/docs/content/docs/01.getting-started/1.start-here.md',
      'apps/docs/content/docs/01.getting-started/3.first-live-query.md',
      'apps/docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md',
      'apps/docs/content/docs/01.getting-started/5.canonical-app-layout.md',
      'apps/docs/content/docs/14.mcp-tools/1.getting-started.md',
    ]

    for (const path of docs) {
      const content = read(path)
      expect(content).not.toContain('Shared contracts live in `shared/schemas/`.')
      expect(content).not.toContain('shared args definition')
      expect(content).not.toContain("import { listWorkspaces } from '~/shared/schemas/workspace'")
    }
  })
})

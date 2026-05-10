import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = '/Users/matthias/Git/0_libs/WORK/trellis'

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('examples gallery docs', () => {
  it('keeps beginner starter docs on the 1.0 starter names', () => {
    const rootReadme = read('README.md')
    const gallery = read('examples/README.md')
    const combined = `${rootReadme}\n${gallery}`

    expect(combined).toContain('--template workspace-mcp')
    expect(combined).not.toContain('--template workspace --mcp')
    expect(combined).not.toContain('--template cms')
    expect(rootReadme).toContain('- `workspace-mcp`')
    expect(rootReadme).not.toMatch(/Official starters:[\s\S]*- `cms`/)
  })

  it('keeps the gallery index split into the learning ladder and advanced branches', () => {
    const gallery = read('examples/README.md')

    expect(gallery).toContain('## Start Here: 01-04')
    expect(gallery).toContain('## Advanced Branches: 05-08')
    expect(gallery).toMatch(/\|\s*Concept\s*\|\s*Canonical example\s*\|\s*Prerequisite\s*\|/)
    expect(gallery).toContain(
      'If you only read one protected-app example in the repo, read `03-team-workspace`.',
    )
  })

  it('keeps every example README on the same teaching contract', () => {
    const examples = [
      'examples/01-public-todo/README.md',
      'examples/02-auth-todo/README.md',
      'examples/03-team-workspace/README.md',
      'examples/04-saas-platform/README.md',
      'examples/05-visibility-access/README.md',
      'examples/06-multi-workspace/README.md',
      'examples/07-mcp-reference/README.md',
      'examples/08-component-mini-cms/README.md',
    ]

    for (const example of examples) {
      const content = read(example)
      expect(content).toContain('## What this example is for')
      expect(content).toContain('## What it teaches')
      expect(content).toContain('## What this example assumes')
      expect(content).toContain('## Files to read first')
      expect(content).toContain('## Demo flow')
      expect(content).toContain('## Run')
      expect(content).toContain('## Test')
      expect(content).toContain('## When to stop here / move on')
    }
  })

  it('marks examples 05-08 as advanced branches that depend on earlier examples', () => {
    const advancedExamples = [
      'examples/05-visibility-access/README.md',
      'examples/06-multi-workspace/README.md',
      'examples/07-mcp-reference/README.md',
      'examples/08-component-mini-cms/README.md',
    ]

    for (const example of advancedExamples) {
      const content = read(example)
      expect(content).toMatch(/already understand/i)
      expect(content).toContain('../03-team-workspace/README.md')
    }

    expect(read('examples/08-component-mini-cms/README.md')).toContain(
      '../07-mcp-reference/README.md',
    )
  })

  it('keeps the advanced branches anchored to their intended lesson', () => {
    const visibility = read('examples/05-visibility-access/README.md')
    const multiWorkspace = read('examples/06-multi-workspace/README.md')
    const mcp = read('examples/07-mcp-reference/README.md')
    const component = read('examples/08-component-mini-cms/README.md')

    expect(visibility).toMatch(/authorization/i)
    expect(visibility).toMatch(/single workspace/i)

    expect(multiWorkspace).toMatch(/architectural fork/i)
    expect(multiWorkspace).toContain('staying on Example 03')

    expect(mcp).toMatch(/not an onboarding example/i)
    expect(mcp).toMatch(/runbook domain is intentionally small/i)

    expect(component).toMatch(/main lesson here is the component boundary/i)
    expect(component).toMatch(/MCP is secondary/i)
  })
})

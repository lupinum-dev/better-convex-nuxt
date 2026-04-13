import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = '/Users/matthias/Git/0_libs/WORK/trellis'

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('future agent conventions', () => {
  it('keeps transport-neutral agent principals in canonical docs and examples', () => {
    const files = [
      'docs/content/docs/1.guide/8.multi-caller-architecture.md',
      'docs/content/docs/7.permissions/8.actor-lanes-and-models.md',
      'examples/03-team-workspace/convex/auth/principal.ts',
      'examples/07-mcp-reference/convex/auth/principal.ts',
      'examples/08-component-mini-cms/shared/principal.ts',
    ]

    for (const file of files) {
      const content = read(file)
      expect(content).toContain("kind: 'agent'")
      expect(content).not.toContain("kind: 'mcp'")
      expect(content).not.toContain("case 'mcp'")
    }
  })

  it('states that transport visibility does not replace Convex business authorization', () => {
    const multiCaller = read('docs/content/docs/1.guide/8.multi-caller-architecture.md')
    const mcpAuth = read('docs/content/docs/13.mcp-tools/3.auth-and-permissions.md')

    expect(multiCaller).toContain('They do **not** replace Convex business authorization')
    expect(mcpAuth).toContain('They do **not** replace Convex business authorization')
    expect(mcpAuth).toContain(
      'the protected Convex handler still owns the real permission decision',
    )
  })

  it('keeps root internal refs and bridge refs as the automation surface', () => {
    const bridgeDocs = read('docs/content/docs/6.server-side/5.private-bridge.md')
    const mcpApi = read('docs/content/docs/12.api-reference/5.mcp.md')
    const miniCmsReadme = read('examples/08-component-mini-cms/README.md')

    expect(bridgeDocs).toContain('stable automation surface')
    expect(mcpApi).toContain('root internal Convex ref')
    expect(miniCmsReadme).toContain('internal bridge refs')
  })
})

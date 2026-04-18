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
      'docs/content/docs/2.concepts/2.multi-caller-architecture.md',
      'docs/content/docs/8.permissions/8.advanced-caller-models.md',
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
    const multiCaller = read('docs/content/docs/2.concepts/2.multi-caller-architecture.md')
    const mcpAuth = read('docs/content/docs/14.mcp-tools/3.auth-and-permissions.md')

    expect(multiCaller).toContain('They do **not** replace Convex business authorization')
    expect(mcpAuth).toContain('tool capability checks do not replace backend authorization')
    expect(mcpAuth).toContain(
      'The protected Convex handler still owns the real permission decision',
    )
  })

  it('keeps root internal refs and bridge refs as the automation surface', () => {
    const bridgeDocs = read('docs/content/docs/7.server-side/5.component-bridge.md')
    const mcpApi = read('docs/content/docs/13.api-reference/5.mcp.md')
    const miniCmsReadme = read('examples/08-component-mini-cms/README.md')

    expect(bridgeDocs).toContain('stable automation seam')
    expect(mcpApi).toContain('project root handlers or bridge refs into the MCP runtime')
    expect(miniCmsReadme).toContain('internal bridge refs')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const operationToolFiles = [
  'apps/harness/server/mcp/tools/delete-post.ts',
  'examples/07-mcp-reference/server/mcp/tools/runbooks/delete.ts',
  'examples/07-mcp-reference/server/mcp/tools/runbooks/bulk-delete.ts',
  'examples/08-component-mini-cms/server/mcp/tools/publish-page.ts',
] as const

describe('MCP descriptor boundary', () => {
  it('keeps active operation tools on descriptors and generated refs', () => {
    for (const file of operationToolFiles) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')

      expect(source, file).not.toMatch(/from ['"].*convex\/.*\/operations['"]/)
      expect(source, file).not.toMatch(/from ['"].*convex\/.*\/domain['"]/)
      expect(source, file).not.toMatch(/from ['"].*convex\/posts['"]/)
      expect(source, file).not.toMatch(/tool\.operation\([^)]*Op[,)]/)
    }
  })
})

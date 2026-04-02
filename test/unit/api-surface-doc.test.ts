import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('generated API surface docs', () => {
  it('documents the installer-driven Nuxt auto-imports and aliases', () => {
    const apiSurface = readFileSync(
      resolve(process.cwd(), 'docs/content/docs/12.api-reference/7.api-surface.md'),
      'utf8',
    )

    expect(apiSurface).toContain('## Which Surface Do I Use?')
    expect(apiSurface).toContain('| `useConvexQuery`')
    expect(apiSurface).toContain('| `useConvexUpload`')
    expect(apiSurface).toContain('| `useConvexAuth`')
    expect(apiSurface).toContain('| `useAuthGuard`')
    expect(apiSurface).toContain('| `serverConvexQuery`')
    expect(apiSurface).toContain('| `#trellis/api`')
    expect(apiSurface).toContain('| `#trellis/server`')
    expect(apiSurface).toContain('| `#trellis/mcp`')
  })
})

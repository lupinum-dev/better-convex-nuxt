import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  findDeletedTrellisSurfaceHits,
  formatDeletedTrellisSurfaceHit,
} from '../../scripts/lib/retained-target-old-paths.mjs'

function createTempRepo(): string {
  return mkdtempSync(resolve(tmpdir(), 'trellis-retained-targets-'))
}

function writeRepoFile(repoRoot: string, relativePath: string, source: string): void {
  const fullPath = resolve(repoRoot, relativePath)
  mkdirSync(resolve(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, source)
}

describe('retained target old-path scanner', () => {
  it('reports deleted Trellis surfaces in retained targets', () => {
    const repoRoot = createTempRepo()
    try {
      writeRepoFile(
        repoRoot,
        'examples/demo/server/mcp/tool.ts',
        [
          "import { tool } from '@lupinum/trellis/bridge'",
          'export default tool.fromOperation(operation)',
        ].join('\n'),
      )

      const hits = findDeletedTrellisSurfaceHits(repoRoot, ['examples'])

      expect(hits).toEqual([
        {
          label: '@lupinum/trellis/bridge',
          line: 1,
          path: 'examples/demo/server/mcp/tool.ts',
        },
        {
          label: 'tool.fromOperation',
          line: 2,
          path: 'examples/demo/server/mcp/tool.ts',
        },
      ])
      expect(formatDeletedTrellisSurfaceHit(hits[0]!)).toBe(
        'examples/demo/server/mcp/tool.ts:1:@lupinum/trellis/bridge',
      )
    } finally {
      rmSync(repoRoot, { force: true, recursive: true })
    }
  })

  it('ignores generated and dependency directories', () => {
    const repoRoot = createTempRepo()
    try {
      writeRepoFile(
        repoRoot,
        'examples/demo/node_modules/pkg/index.ts',
        "import '@lupinum/trellis/functions'\n",
      )
      writeRepoFile(
        repoRoot,
        'examples/demo/convex/_generated/api.ts',
        'const old = "tool.fromOperation"\n',
      )

      expect(findDeletedTrellisSurfaceHits(repoRoot, ['examples'])).toEqual([])
    } finally {
      rmSync(repoRoot, { force: true, recursive: true })
    }
  })
})

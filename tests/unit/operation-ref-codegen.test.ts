import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  renderStarterGeneratedFiles,
  type StarterFixtureManifest,
} from '../../src/module-internals/starter-fixture-codegen'

describe('operation ref codegen', () => {
  it('renders explicit checked operation bindings from the phase0 starter manifest', () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/starter.manifest.json'),
        'utf8',
      ),
    ) as StarterFixtureManifest
    const rendered = renderStarterGeneratedFiles(manifest)

    const fixture = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/generated/operation-refs.ts'),
      'utf8',
    )
    const mcpToolRefsFixture = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/generated/mcp-tool-refs.ts'),
      'utf8',
    )

    expect(rendered).toEqual([
      { path: 'generated/operation-refs.ts', content: fixture },
      { path: 'generated/mcp-tool-refs.ts', content: mcpToolRefsFixture },
    ])
  })
})

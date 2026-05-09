import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderOperationRefsModule } from '../../src/module-internals/operation-ref-codegen'

describe('operation ref codegen', () => {
  it('renders explicit checked operation bindings for the phase0 workspace MCP fixture', () => {
    const rendered = renderOperationRefsModule({
      projectOperationRefImport: '../../../../src/runtime/functions/define-operation',
      apiImport: '../convex/_generated/api',
      descriptorImport: '../shared/features/projects/operations',
      descriptors: ['deleteProjectDescriptor'],
      refs: [
        {
          exportName: 'executeDeleteProjectRef',
          descriptorName: 'deleteProjectDescriptor',
          projection: 'execute',
          apiPath: ['features', 'projects', 'domain', 'deleteProject'],
        },
        {
          exportName: 'previewDeleteProjectRef',
          descriptorName: 'deleteProjectDescriptor',
          projection: 'preview',
          apiPath: ['features', 'projects', 'domain', 'previewDeleteProject'],
        },
      ],
    })

    const fixture = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/generated/operation-refs.ts'),
      'utf8',
    )

    expect(rendered).toBe(fixture)
  })
})

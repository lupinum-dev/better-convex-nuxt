import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { toAppInventoryJson } from '../../src/runtime/feature'
import { getOperationMetadata } from '../../src/runtime/functions'
import { deleteProjectOperation } from '../fixtures/phase0-workspace-mcp/convex/features/projects/operations'
import { appInventory } from '../fixtures/phase0-workspace-mcp/shared/app-inventory'

vi.mock('nitropack/runtime', () => ({
  useEvent: vi.fn(),
}))

vi.mock('../../src/runtime/convex/server/convex', () => ({
  serverConvexQuery: vi.fn(),
  serverConvexMutation: vi.fn(),
  serverConvexAction: vi.fn(),
}))

describe('phase0 workspace-mcp fixture', () => {
  it('builds inventory from shared descriptors and binds MCP tools without Convex implementation imports', async () => {
    const { default: deleteProjectTool } =
      await import('../fixtures/phase0-workspace-mcp/server/mcp/tools/delete-project')

    expect(toAppInventoryJson(appInventory)).toEqual({
      schemaVersion: 1,
      layers: [],
      features: ['projects'],
      operations: [{ id: 'projects.delete', kind: 'destructive', feature: 'projects' }],
      findings: [],
    })

    expect(getOperationMetadata(deleteProjectOperation)).toMatchObject({
      id: 'projects.delete',
      kind: 'destructive',
      permissionKey: 'projects.delete',
      safety: 'destructive-write',
    })
    expect(deleteProjectTool.name).toBe('delete-project')

    const toolSource = readFileSync(
      resolve(
        process.cwd(),
        'tests/fixtures/phase0-workspace-mcp/server/mcp/tools/delete-project.ts',
      ),
      'utf8',
    )
    expect(toolSource).not.toContain('/convex/')
    expect(toolSource).not.toContain('convex/features')

    const operationRefsSource = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/generated/operation-refs.ts'),
      'utf8',
    )
    expect(operationRefsSource).toContain("from '../convex/_generated/api'")
    expect(operationRefsSource).not.toContain('{} as never')

    const generatedApiTypes = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/convex/_generated/api.d.ts'),
      'utf8',
    )
    expect(generatedApiTypes).toContain('"features/projects/domain"')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { toAppInventoryJson } from '../../src/runtime/feature'
import { getOperationMetadata } from '../../src/runtime/functions'
import { deleteProjectOperation } from '../fixtures/phase0-workspace-mcp/convex/features/projects/operations'
import { appInventory } from '../fixtures/phase0-workspace-mcp/shared/app-inventory'

const { useEventMock } = vi.hoisted(() => ({
  useEventMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useEvent: useEventMock,
}))

vi.mock('../../src/runtime/convex/server/convex', () => ({
  serverConvexQuery: vi.fn(),
  serverConvexMutation: vi.fn(),
  serverConvexAction: vi.fn(),
}))

function createEvent(): H3Event {
  return {
    __is_event__: true,
    method: 'POST',
    path: '/mcp',
    headers: new Headers(),
    context: {},
    node: {
      req: {},
      res: {},
    },
  } as unknown as H3Event
}

describe('phase0 workspace-mcp fixture', () => {
  it('builds inventory from shared descriptors and binds MCP tools without Convex implementation imports', async () => {
    const { default: deleteProjectTool } =
      await import('../fixtures/phase0-workspace-mcp/server/mcp/tools/delete-project')
    const { default: createProjectTool } =
      await import('../fixtures/phase0-workspace-mcp/server/mcp/tools/create-project')

    expect(toAppInventoryJson(appInventory)).toEqual({
      schemaVersion: 1,
      layers: [],
      features: ['projects'],
      operations: [
        {
          id: 'projects.delete',
          name: 'deleteProject',
          kind: 'destructive',
          feature: 'projects',
          permissionKey: 'projects.delete',
          safety: 'destructive-write',
        },
      ],
      findings: [],
    })

    expect(getOperationMetadata(deleteProjectOperation)).toMatchObject({
      id: 'projects.delete',
      kind: 'destructive',
      permissionKey: 'projects.delete',
      safety: 'destructive-write',
    })
    expect(deleteProjectTool.name).toBe('delete-project')
    expect(createProjectTool.name).toBe('create-project')

    for (const toolPath of [
      'tests/fixtures/phase0-workspace-mcp/server/mcp/tools/delete-project.ts',
      'tests/fixtures/phase0-workspace-mcp/server/mcp/tools/create-project.ts',
    ]) {
      const toolSource = readFileSync(resolve(process.cwd(), toolPath), 'utf8')
      expect(toolSource).not.toContain('/convex/')
      expect(toolSource).not.toContain('convex/features')
    }

    const operationRefsSource = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/generated/operation-refs.ts'),
      'utf8',
    )
    expect(operationRefsSource).toContain("from '../convex/_generated/api'")
    expect(operationRefsSource).not.toContain('{} as never')

    const mcpToolRefsSource = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/generated/mcp-tool-refs.ts'),
      'utf8',
    )
    expect(mcpToolRefsSource).toContain("from '../convex/_generated/api'")
    expect(mcpToolRefsSource).toContain('projectMcpToolRef')

    const generatedApiTypes = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp/convex/_generated/api.d.ts'),
      'utf8',
    )
    expect(generatedApiTypes).toContain('"features/projects/domain"')
  })

  it('routes destructive execute through operation-execute forwarding options', async () => {
    const { default: deleteProjectTool } =
      await import('../fixtures/phase0-workspace-mcp/server/mcp/tools/delete-project')
    const { convexCalls } = await import('../fixtures/phase0-workspace-mcp/server/mcp/runtime')
    convexCalls.length = 0
    const event = createEvent()
    useEventMock.mockReturnValue(event)

    const previewResult = (await deleteProjectTool.handler(
      { id: 'project-1' } as never,
      event as never,
    )) as {
      structuredContent?: {
        preview?: {
          confirmation?: { token?: string }
        }
      }
    }
    const confirmationToken = previewResult.structuredContent?.preview?.confirmation?.token
    expect(confirmationToken).toEqual(expect.any(String))

    await deleteProjectTool.handler(
      {
        id: 'project-1',
        _confirmationToken: confirmationToken,
      } as never,
      event as never,
    )

    expect(convexCalls).toEqual([
      {
        operation: 'query',
        args: { id: 'project-1' },
        options: {
          identityForwardingEnvelope: {
            purpose: 'operation-preview',
          },
        },
      },
      {
        operation: 'query',
        args: { id: 'project-1' },
        options: {
          identityForwardingEnvelope: {
            purpose: 'operation-preview',
          },
        },
      },
      {
        operation: 'mutation',
        args: {
          id: 'project-1',
        },
        options: {
          identityForwardingEnvelope: {
            purpose: 'operation-execute',
            jti: expect.any(String),
          },
        },
      },
    ])
  })
})

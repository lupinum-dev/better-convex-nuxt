import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/runtime/server/utils/convex', () => ({
  serverConvexQuery: vi.fn(),
  serverConvexMutation: vi.fn(),
  serverConvexAction: vi.fn(),
}))

describe('mcp entrypoint exports', () => {
  let mcpApi: typeof import('../../src/runtime/mcp/index')

  beforeAll(async () => {
    mcpApi = await import('../../src/runtime/mcp/index')
  })

  it('exports the MCP API surface', () => {
    expect(Object.keys(mcpApi).sort()).toEqual([
      'defineTool',
      'withSummary',
      'wrapError',
      'wrapPreview',
      'wrapSuccess',
    ])
  })

  it('exports envelope helpers', () => {
    expect(mcpApi).toHaveProperty('wrapError')
    expect(mcpApi).toHaveProperty('wrapSuccess')
    expect(mcpApi).toHaveProperty('wrapPreview')
    expect(mcpApi).toHaveProperty('withSummary')
  })
})

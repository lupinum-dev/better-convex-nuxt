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

  it('exports the V2 MCP API', () => {
    expect(mcpApi).toHaveProperty('defineTool')
    expect(mcpApi).not.toHaveProperty('defineConvexTool')
    expect(mcpApi).not.toHaveProperty('createConvexTools')
  })

  it('exports envelope helpers', () => {
    expect(mcpApi).toHaveProperty('wrapError')
    expect(mcpApi).toHaveProperty('wrapSuccess')
    expect(mcpApi).toHaveProperty('wrapPreview')
    expect(mcpApi).toHaveProperty('withSummary')
  })
})

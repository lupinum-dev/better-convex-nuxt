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

  it('exports new API', () => {
    expect(mcpApi).toHaveProperty('defineConvexTool')
    expect(mcpApi).toHaveProperty('createConvexTools')
  })

  it('exports envelope helpers', () => {
    expect(mcpApi).toHaveProperty('wrapError')
    expect(mcpApi).toHaveProperty('wrapSuccess')
    expect(mcpApi).toHaveProperty('wrapPreview')
    expect(mcpApi).toHaveProperty('withSummary')
  })

  it('exports deprecated defineConvexMcpTool', () => {
    expect(mcpApi).toHaveProperty('defineConvexMcpTool')
  })
})

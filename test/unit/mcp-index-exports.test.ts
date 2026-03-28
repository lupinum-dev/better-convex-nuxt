import { beforeAll, describe, expect, it } from 'vitest'

describe('mcp entrypoint exports', () => {
  let mcpApi: typeof import('../../src/runtime/mcp/index')

  beforeAll(async () => {
    mcpApi = await import('../../src/runtime/mcp/index')
  })

  it('exports new API', () => {
    expect(mcpApi).toHaveProperty('defineConvexTool')
    expect(mcpApi).toHaveProperty('createConvexTools')
  })

  it('exports deprecated defineConvexMcpTool', () => {
    expect(mcpApi).toHaveProperty('defineConvexMcpTool')
  })
})

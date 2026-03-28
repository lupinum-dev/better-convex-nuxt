import { beforeAll, describe, expect, it } from 'vitest'

describe('mcp entrypoint exports', () => {
  let mcpApi: typeof import('../../src/runtime/mcp/index')

  beforeAll(async () => {
    mcpApi = await import('../../src/runtime/mcp/index')
  })

  it('exports MCP-only helper names', () => {
    expect(mcpApi).toHaveProperty('defineConvexMcpTool')
  })
})

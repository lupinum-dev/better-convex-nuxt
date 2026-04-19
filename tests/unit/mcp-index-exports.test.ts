import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/runtime/convex/server/convex', () => ({
  serverConvexQuery: vi.fn(),
  serverConvexMutation: vi.fn(),
  serverConvexAction: vi.fn(),
}))

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({
  completable: vi.fn(),
  defineMcpHandler: vi.fn(),
  defineMcpPrompt: vi.fn(),
  defineMcpResource: vi.fn(),
  defineMcpTool: vi.fn(),
  extractToolNames: vi.fn(),
  imageResult: vi.fn(),
}))

vi.mock('../../src/runtime/mcp/use-mcp-session', () => ({
  useMcpSession: vi.fn(),
}))

vi.mock('../../src/runtime/mcp/use-mcp-server', () => ({
  useMcpServer: vi.fn(),
}))

describe('mcp entrypoint exports', () => {
  let mcpApi: typeof import('../../src/runtime/mcp/index')

  beforeAll(async () => {
    mcpApi = await import('../../src/runtime/mcp/index')
  })

  it('exports the MCP API surface', () => {
    expect(Object.keys(mcpApi).sort()).toEqual(
      expect.arrayContaining([
        'completable',
        'defineMcpHandler',
        'defineMcpPrompt',
        'defineMcpResource',
        'defineMcpTool',
        'defineTool',
        'extractToolNames',
        'imageResult',
        'useMcpServer',
        'useMcpSession',
        'withSummary',
        'wrapError',
        'wrapPreview',
        'wrapSuccess',
      ]),
    )
  })

  it('exports toolkit primitives and envelope helpers', () => {
    expect(mcpApi).toHaveProperty('defineMcpTool')
    expect(mcpApi).toHaveProperty('defineMcpResource')
    expect(mcpApi).toHaveProperty('defineMcpPrompt')
    expect(mcpApi).toHaveProperty('defineMcpHandler')
    expect(mcpApi).toHaveProperty('useMcpSession')
    expect(mcpApi).toHaveProperty('useMcpServer')
    expect(mcpApi).toHaveProperty('wrapError')
    expect(mcpApi).toHaveProperty('wrapSuccess')
    expect(mcpApi).toHaveProperty('wrapPreview')
    expect(mcpApi).toHaveProperty('withSummary')
  })
})

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
  let advancedApi: typeof import('../../src/runtime/mcp/advanced')

  beforeAll(async () => {
    mcpApi = await import('../../src/runtime/mcp/index')
    advancedApi = await import('../../src/runtime/mcp/advanced')
  })

  it('exports the blessed MCP API surface', () => {
    expect(Object.keys(mcpApi).sort()).toEqual(
      expect.arrayContaining([
        'completable',
        'defineMcpApp',
        'defineMcpHandler',
        'defineMcpPrompt',
        'defineMcpResource',
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

  it('does not surface low-level helpers from the top-level entrypoint', () => {
    expect(mcpApi).not.toHaveProperty('defineMcpTool')
    expect(mcpApi).not.toHaveProperty('defineTool')
  })

  it('exposes low-level helpers under the advanced subpath', () => {
    expect(advancedApi).toHaveProperty('defineMcpTool')
    expect(advancedApi).toHaveProperty('defineTool')
  })

  it('exports toolkit primitives and envelope helpers', () => {
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

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useEventMock, useStorageMock } = vi.hoisted(() => ({
  useEventMock: vi.fn(),
  useStorageMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useEvent: useEventMock,
  useStorage: useStorageMock,
}))

describe('useMcpSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStorageMock.mockReturnValue({
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      hasItem: vi.fn(),
      getKeys: vi.fn(),
      clear: vi.fn(),
    })
  })

  it('rejects invalid session ids', async () => {
    useEventMock.mockReturnValue({
      node: {
        req: {
          headers: {
            'mcp-session-id': 'not-a-valid-session-id',
          },
        },
      },
    })

    const { useMcpSession } = await import('../../src/runtime/mcp/use-mcp-session')

    expect(() => useMcpSession()).toThrow(/Invalid MCP session ID format/)
  })

  it('stores session data under the validated session namespace', async () => {
    const sessionId = '123e4567-e89b-42d3-a456-426614174000'
    useEventMock.mockReturnValue({
      context: {
        mcpAuth: {
          role: 'member',
          userId: 'user-1',
          workspaceId: 'org-1',
        },
      },
      node: {
        req: {
          headers: {
            'mcp-session-id': sessionId,
          },
        },
      },
    })

    const { useMcpSession } = await import('../../src/runtime/mcp/use-mcp-session')
    const session = useMcpSession()

    expect(session.sessionId).toBe(sessionId)
    expect(String(useStorageMock.mock.calls[0]?.[0] ?? '')).toMatch(
      new RegExp(`^mcp:sessions:[^:]+:${sessionId}$`),
    )
  })
})

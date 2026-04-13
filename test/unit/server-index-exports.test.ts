import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { serverConvexActionMock, serverConvexMutationMock, serverConvexQueryMock } = vi.hoisted(
  () => ({
    serverConvexQueryMock: vi.fn(),
    serverConvexMutationMock: vi.fn(),
    serverConvexActionMock: vi.fn(),
  }),
)

vi.mock('./../../src/runtime/server/utils/convex', () => ({
  serverConvexQuery: serverConvexQueryMock,
  serverConvexMutation: serverConvexMutationMock,
  serverConvexAction: serverConvexActionMock,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ public: { convex: {} } }),
}))

vi.mock('nitropack/runtime', () => ({
  useEvent: () => undefined,
}))

describe('server entrypoint exports', () => {
  let serverApi: typeof import('../../src/runtime/server/index')

  beforeAll(async () => {
    serverApi = await import('../../src/runtime/server/index')
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports hard-cutover server helper names', () => {
    expect(serverApi).toHaveProperty('serverConvexQuery')
    expect(serverApi).toHaveProperty('serverConvexMutation')
    expect(serverApi).toHaveProperty('serverConvexAction')
    expect(serverApi).toHaveProperty('createServerConvexCaller')
  })

  it('does not expose legacy or MCP-only helper names', () => {
    expect(serverApi).not.toHaveProperty('fetchQuery')
    expect(serverApi).not.toHaveProperty('fetchMutation')
    expect(serverApi).not.toHaveProperty('fetchAction')
    expect(serverApi).not.toHaveProperty('defineConvexMcpTool')
  })

  it('creates a caller that always uses auth:none', async () => {
    serverConvexQueryMock.mockResolvedValueOnce({ ok: 'query' })
    serverConvexMutationMock.mockResolvedValueOnce({ ok: 'mutation' })
    serverConvexActionMock.mockResolvedValueOnce({ ok: 'action' })

    const event = { __is_event__: true } as never
    const caller = serverApi.createServerConvexCaller(event)

    await expect(caller.query({ _path: 'notes:list' } as never, { limit: 1 } as never)).resolves.toEqual({
      ok: 'query',
    })
    await expect(
      caller.mutation({ _path: 'notes:create' } as never, { title: 'Hello' } as never),
    ).resolves.toEqual({ ok: 'mutation' })
    await expect(caller.action({ _path: 'notes:sync' } as never, { id: 'n1' } as never)).resolves.toEqual({
      ok: 'action',
    })

    expect(serverConvexQueryMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:list' },
      { limit: 1 },
      { auth: 'none' },
    )
    expect(serverConvexMutationMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:create' },
      { title: 'Hello' },
      { auth: 'none' },
    )
    expect(serverConvexActionMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:sync' },
      { id: 'n1' },
      { auth: 'none' },
    )
  })
})

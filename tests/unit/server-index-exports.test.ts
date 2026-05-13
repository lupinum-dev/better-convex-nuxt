import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { serverConvexActionMock, serverConvexMutationMock, serverConvexQueryMock } = vi.hoisted(
  () => ({
    serverConvexQueryMock: vi.fn(),
    serverConvexMutationMock: vi.fn(),
    serverConvexActionMock: vi.fn(),
  }),
)

vi.mock('../../src/runtime/convex/server/convex', () => ({
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

  it('creates a caller that defaults to auth:auto', async () => {
    serverConvexQueryMock.mockResolvedValueOnce({ ok: 'query' })
    serverConvexMutationMock.mockResolvedValueOnce({ ok: 'mutation' })
    serverConvexActionMock.mockResolvedValueOnce({ ok: 'action' })

    const event = { __is_event__: true } as never
    const caller = serverApi.createServerConvexCaller(event)

    await expect(
      caller.query({ _path: 'notes:list' } as never, { limit: 1 } as never),
    ).resolves.toEqual({
      ok: 'query',
    })
    await expect(
      caller.mutation({ _path: 'notes:create' } as never, { title: 'Hello' } as never),
    ).resolves.toEqual({ ok: 'mutation' })
    await expect(
      caller.action({ _path: 'notes:sync' } as never, { id: 'n1' } as never),
    ).resolves.toEqual({
      ok: 'action',
    })

    expect(serverConvexQueryMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:list' },
      { limit: 1 },
      { auth: 'auto' },
    )
    expect(serverConvexMutationMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:create' },
      { title: 'Hello' },
      { auth: 'auto' },
    )
    expect(serverConvexActionMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:sync' },
      { id: 'n1' },
      { auth: 'auto' },
    )
  })

  it('forwards trusted auth, caller, and actingFor options to each request-scoped call', async () => {
    serverConvexQueryMock.mockResolvedValueOnce({ ok: true })

    const event = { __is_event__: true } as never
    const caller = { kind: 'agent', agentId: 'a1', subject: 'agent:a1' }
    const actingFor = { subject: 'user:u1', reason: 'approved' }
    const convex = serverApi.createServerConvexCaller(event, {
      auth: 'trusted',
      caller,
      actingFor,
    })

    await expect(
      convex.query({ _path: 'notes:list' } as never, { limit: 2 } as never),
    ).resolves.toEqual({
      ok: true,
    })

    expect(serverConvexQueryMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:list' },
      { limit: 2 },
      { auth: 'trusted', caller, actingFor },
    )
  })

  it('forwards per-call trusted envelope options to request-scoped calls', async () => {
    serverConvexMutationMock.mockResolvedValueOnce({ ok: true })

    const event = { __is_event__: true } as never
    const caller = { kind: 'agent', agentId: 'a1', subject: 'agent:a1' }
    const convex = serverApi.createServerConvexCaller(event, {
      auth: 'trusted',
      caller,
    })

    await convex.mutation({ _path: 'notes:delete' } as never, { id: 'n1' } as never, {
      identityForwardingEnvelope: {
        purpose: 'operation-execute',
        jti: 'confirm-1',
      },
    })

    expect(serverConvexMutationMock).toHaveBeenCalledWith(
      event,
      { _path: 'notes:delete' },
      { id: 'n1' },
      {
        auth: 'trusted',
        caller,
        identityForwardingEnvelope: {
          purpose: 'operation-execute',
          jti: 'confirm-1',
        },
      },
    )
  })

  it('rejects forwarded principals outside the identity forwarding path', () => {
    const event = { __is_event__: true } as never

    expect(() =>
      serverApi.createServerConvexCaller(event, {
        auth: 'auto',
        caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      }),
    ).toThrow(/only allows forwarded identity on `auth: 'trusted'` calls/)
  })

  it('requires caller when using identity forwarding', () => {
    const event = { __is_event__: true } as never

    expect(() =>
      serverApi.createServerConvexCaller(event, {
        auth: 'trusted',
      }),
    ).toThrow(/requires `caller` on identity forwarding calls/)
  })

  it('rejects forwarded actingFor outside the identity forwarding path', () => {
    const event = { __is_event__: true } as never

    expect(() =>
      serverApi.createServerConvexCaller(event, {
        auth: 'auto',
        actingFor: { subject: 'user:u1', reason: 'approved' },
      }),
    ).toThrow(/only allows forwarded identity on `auth: 'trusted'` calls/)
  })
})

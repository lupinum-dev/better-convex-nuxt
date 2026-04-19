import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createErrorMock, readBodyMock, serverConvexMutationMock } = vi.hoisted(() => ({
  createErrorMock: vi.fn(
    (input: { statusCode: number; message?: string; statusMessage?: string }) =>
      Object.assign(new Error(input.message ?? input.statusMessage ?? 'error'), input),
  ),
  readBodyMock: vi.fn(),
  serverConvexMutationMock: vi.fn(),
}))

vi.mock('h3', () => ({
  createError: createErrorMock,
  defineEventHandler: (handler: unknown) => handler,
  readBody: readBodyMock,
}))

vi.mock('#trellis/server', () => ({
  serverConvexMutation: serverConvexMutationMock,
}))

vi.mock('~/convex/_generated/api', () => ({
  internal: {
    domain: {
      webhooks: {
        processTodoSyncWebhook: { _path: 'internal/domain/webhooks:processTodoSyncWebhook' },
      },
    },
  },
}))

const { default: handler } = await import('./webhook.post')

function createEvent(signature = 'team-workspace-demo') {
  return {
    node: {
      req: {
        headers: {
          'x-example-signature': signature,
        },
      },
    },
  }
}

describe('example 03 webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TEAM_WORKSPACE_WEBHOOK_SECRET = 'team-workspace-demo'
  })

  it('verifies the route secret and dispatches to the internal webhook mutation', async () => {
    readBodyMock.mockResolvedValue({
      workspaceId: 'workspace_123',
      eventId: 'evt_123',
      title: 'Webhook todo',
      completed: true,
      externalId: 'ext_123',
    })
    serverConvexMutationMock.mockResolvedValue('todo_123')

    const result = await handler(createEvent() as never)

    expect(result).toEqual({
      ok: true,
      todoId: 'todo_123',
    })
    expect(serverConvexMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.any(Object),
      }),
      expect.objectContaining({
        _path: 'internal/domain/webhooks:processTodoSyncWebhook',
      }),
      {
        workspaceId: 'workspace_123',
        eventId: 'evt_123',
        title: 'Webhook todo',
        completed: true,
        externalId: 'ext_123',
      },
      { auth: 'none' },
    )
  })

  it('rejects webhook bodies that omit required fields', async () => {
    readBodyMock.mockResolvedValue({
      workspaceId: 'workspace_123',
      title: 'Webhook todo',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Missing required fields: workspaceId, eventId, title',
    })
  })

  it('fails closed when the route secret is not configured', async () => {
    delete process.env.TEAM_WORKSPACE_WEBHOOK_SECRET
    readBodyMock.mockResolvedValue({
      workspaceId: 'workspace_123',
      eventId: 'evt_123',
      title: 'Webhook todo',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 500,
      message: 'TEAM_WORKSPACE_WEBHOOK_SECRET is required for the webhook example.',
    })
  })

  it('rejects invalid signatures', async () => {
    readBodyMock.mockResolvedValue({
      workspaceId: 'workspace_123',
      eventId: 'evt_123',
      title: 'Webhook todo',
    })

    await expect(handler(createEvent('wrong-signature') as never)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid signature',
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createErrorMock, readBodyMock, serverConvexMutationMock } = vi.hoisted(() => ({
  createErrorMock: vi.fn((input: { statusCode: number; message: string }) =>
    Object.assign(new Error(input.message), input),
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

vi.mock('#trellis/api', () => ({
  api: {
    domain: {
      tasks: {
        create: { _path: 'domain/tasks:create' },
      },
    },
  },
}))

const { default: handler } = await import('./webhook.post')

function createEvent(signature = 'project-board-demo') {
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

describe('example 04 webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PROJECT_BOARD_WEBHOOK_ACTOR_ID = 'user_owner'
  })

  it('accepts trusted caller webhook bodies and uses the server-owned actor identity', async () => {
    readBodyMock.mockResolvedValue({
      projectId: 'project_123',
      title: 'Webhook task',
    })
    serverConvexMutationMock.mockResolvedValue('task_123')

    const result = await handler(createEvent() as never)

    expect(result).toEqual({
      ok: true,
      taskId: 'task_123',
    })
    expect(serverConvexMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.any(Object),
      }),
      expect.objectContaining({
        _path: 'domain/tasks:create',
      }),
      {
        projectId: 'project_123',
        title: 'Webhook task',
        priority: 'medium',
      },
      {
        auth: 'trusted',
        actor: {
          userId: 'user_owner',
        },
      },
    )
  })

  it('rejects webhook bodies that omit the required task fields', async () => {
    readBodyMock.mockResolvedValue({
      projectId: 'project_123',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'projectId and title are required.',
    })
  })

  it('fails closed when the webhook actor identity is not configured', async () => {
    delete process.env.PROJECT_BOARD_WEBHOOK_ACTOR_ID
    readBodyMock.mockResolvedValue({
      projectId: 'project_123',
      title: 'Webhook task',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 500,
      message: 'PROJECT_BOARD_WEBHOOK_ACTOR_ID is required for the webhook example.',
    })
  })
})

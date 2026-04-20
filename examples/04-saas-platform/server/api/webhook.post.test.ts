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
  readVerifiedWebhookBody: async ({
    signature,
    secret,
    readBody,
    parse,
  }: {
    signature: string | string[] | undefined
    secret: string
    readBody: () => Promise<unknown>
    parse?: (body: unknown) => unknown | Promise<unknown>
  }) => {
    if (signature !== secret) {
      throw createErrorMock({ statusCode: 401, message: 'Invalid signature' })
    }
    const body = await readBody()
    return parse ? await parse(body) : body
  },
  serverConvexMutation: serverConvexMutationMock,
}))

vi.mock('../../convex/_generated/api', () => ({
  internal: {
    features: {
      tasks: {
        webhooks: {
          createTaskFromWebhookMutation: {
            _path: 'internal/features/tasks/webhooks:createTaskFromWebhookMutation',
          },
        },
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
    process.env.PROJECT_BOARD_WEBHOOK_SECRET = 'project-board-demo'
  })

  it('accepts verified webhook bodies and calls the internal mutation path', async () => {
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
        _path: 'internal/features/tasks/webhooks:createTaskFromWebhookMutation',
      }),
      {
        projectId: 'project_123',
        title: 'Webhook task',
        priority: 'medium',
      },
      {
        auth: 'none',
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

  it('fails closed when the webhook route secret is not configured', async () => {
    delete process.env.PROJECT_BOARD_WEBHOOK_SECRET
    readBodyMock.mockResolvedValue({
      projectId: 'project_123',
      title: 'Webhook task',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 500,
      message: 'PROJECT_BOARD_WEBHOOK_SECRET is required for the webhook example.',
    })
  })
})

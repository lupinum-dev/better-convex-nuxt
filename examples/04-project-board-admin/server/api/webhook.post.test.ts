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

vi.mock('#convex/server', () => ({
  serverConvexMutation: serverConvexMutationMock,
}))

vi.mock('~/convex/_generated/api', () => ({
  api: {
    tasks: {
      create: { _path: 'tasks:create' },
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
  })

  it('accepts trusted caller webhook bodies without workspaceId and forwards only userId', async () => {
    readBodyMock.mockResolvedValue({
      projectId: 'project_123',
      title: 'Webhook task',
      createdBy: 'user_admin',
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
        _path: 'tasks:create',
      }),
      {
        projectId: 'project_123',
        title: 'Webhook task',
        priority: 'medium',
      },
      {
        auth: 'trusted',
        actor: {
          userId: 'user_admin',
        },
      },
    )
  })

  it('rejects webhook bodies that omit createdBy even without workspaceId checks', async () => {
    readBodyMock.mockResolvedValue({
      projectId: 'project_123',
      title: 'Webhook task',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'projectId, title, and createdBy are required.',
    })
  })
})

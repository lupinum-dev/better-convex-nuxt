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
  readSharedSecretWebhookBody: async ({
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
  delegateToUser: async ({ userId, reason }: { userId: string; reason?: string }) => ({
    subject: `user:${userId}`,
    ...(reason ? { reason } : {}),
  }),
  serverConvexMutation: serverConvexMutationMock,
}))

vi.mock('#trellis/api', () => ({
  api: {
    features: {
      runbooks: {
        domain: {
          create: { _path: 'features/runbooks/domain:create' },
        },
      },
    },
  },
}))

const { default: handler } = await import('./runbook-webhook.post')

function createEvent(signature = 'mcp-reference-demo') {
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

describe('example 07 webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MCP_REFERENCE_WEBHOOK_SECRET = 'mcp-reference-demo'
    process.env.MCP_REFERENCE_WEBHOOK_USER_ID = 'user_bot'
  })

  it('verifies the route secret and forwards a service caller plus delegated user', async () => {
    readBodyMock.mockResolvedValue({
      title: 'Webhook runbook',
      visibility: 'workspace',
      tags: ['webhook', 'ops'],
    })
    serverConvexMutationMock.mockResolvedValue('runbook_123')

    const result = await handler(createEvent() as never)

    expect(result).toEqual({
      ok: true,
      runbookId: 'runbook_123',
    })
    expect(serverConvexMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.any(Object),
      }),
      expect.objectContaining({
        _path: 'features/runbooks/domain:create',
      }),
      {
        title: 'Webhook runbook',
        summary: 'Created by the verified webhook example.',
        content: '# Imported runbook\n\nThis runbook came through the verified webhook path.',
        visibility: 'workspace',
        tags: ['webhook', 'ops'],
      },
      {
        auth: 'trusted',
        caller: {
          kind: 'service',
          serviceId: 'runbook-webhook',
          subject: 'service:runbook-webhook',
        },
        actingFor: {
          subject: 'user:user_bot',
          reason: 'verified runbook webhook',
        },
      },
    )
  })

  it('rejects webhook bodies that omit the required title', async () => {
    readBodyMock.mockResolvedValue({
      visibility: 'workspace',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'title is required.',
    })
  })

  it('rejects invalid visibility values', async () => {
    readBodyMock.mockResolvedValue({
      title: 'Webhook runbook',
      visibility: 'invalid',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'visibility must be one of: draft, workspace, public.',
    })
  })

  it('fails closed when the route secret is not configured', async () => {
    delete process.env.MCP_REFERENCE_WEBHOOK_SECRET
    readBodyMock.mockResolvedValue({
      title: 'Webhook runbook',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 500,
      message: 'MCP_REFERENCE_WEBHOOK_SECRET is required for the webhook example.',
    })
  })

  it('fails closed when the delegated webhook appIdentity is not configured', async () => {
    delete process.env.MCP_REFERENCE_WEBHOOK_USER_ID
    readBodyMock.mockResolvedValue({
      title: 'Webhook runbook',
    })

    await expect(handler(createEvent() as never)).rejects.toMatchObject({
      statusCode: 500,
      message: 'MCP_REFERENCE_WEBHOOK_USER_ID is required for the webhook example.',
    })
  })

  it('rejects invalid signatures', async () => {
    readBodyMock.mockResolvedValue({
      title: 'Webhook runbook',
    })

    await expect(handler(createEvent('wrong-signature') as never)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid signature',
    })
  })
})

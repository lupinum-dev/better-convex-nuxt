import { describe, expect, it } from 'vitest'

import { delegateToUser } from '../../src/runtime/server/delegation'
import { readVerifiedWebhookBody } from '../../src/runtime/server/webhooks'

describe('server delegation helper', () => {
  it('creates a represented-user delegation after explicit validation', async () => {
    await expect(
      delegateToUser({
        userId: 'user_123',
        allow: true,
        reason: 'verified webhook handoff',
      }),
    ).resolves.toEqual({
      subject: 'user:user_123',
      reason: 'verified webhook handoff',
    })
  })

  it('rejects cross-tenant represented-user delegation', async () => {
    await expect(
      delegateToUser({
        userId: 'user_123',
        allow: true,
        expectedTenantId: 'workspace_alpha',
        targetTenantId: 'workspace_beta',
      }),
    ).rejects.toThrow(/outside the expected tenant boundary/i)
  })

  it('rejects delegation when caller validation fails', async () => {
    await expect(
      delegateToUser({
        userId: 'user_123',
        allow: false,
      }),
    ).rejects.toThrow(/rejected by the caller validation step/i)
  })
})

describe('verified webhook helper', () => {
  it('accepts verified webhook bodies and runs the parser', async () => {
    await expect(
      readVerifiedWebhookBody({
        signature: 'shared-secret',
        secret: 'shared-secret',
        readBody: async () => ({ title: 'Deploy' }),
        parse: (body) => ({ ...body, title: body.title.toUpperCase() }),
      }),
    ).resolves.toEqual({ title: 'DEPLOY' })
  })

  it('rejects invalid webhook signatures', async () => {
    await expect(
      readVerifiedWebhookBody({
        signature: 'wrong-secret',
        secret: 'shared-secret',
        readBody: async () => ({ title: 'Deploy' }),
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid signature',
    })
  })

  it('rejects replayed webhook deliveries when idempotency is configured', async () => {
    await expect(
      readVerifiedWebhookBody({
        signature: 'shared-secret',
        secret: 'shared-secret',
        readBody: async () => ({ eventId: 'evt_123' }),
        idempotency: {
          key: 'evt_123',
          consume: async () => false,
          conflictMessage: 'Webhook event already processed.',
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Webhook event already processed.',
    })
  })
})

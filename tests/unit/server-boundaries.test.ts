import { describe, expect, it } from 'vitest'

import { delegateToUser } from '../../src/runtime/server/acting-for'
import {
  createWebhookHmacSignature,
  isWebhookHmacSignatureValid,
  readHmacVerifiedWebhookBody,
  readSharedSecretWebhookBody,
} from '../../src/runtime/server/webhooks'

describe('server actingFor helper', () => {
  it('creates a represented-user actingFor after explicit validation', async () => {
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

  it('rejects cross-scope represented-user actingFor', async () => {
    await expect(
      delegateToUser({
        userId: 'user_123',
        allow: true,
        expectedWorkspaceId: 'workspace_alpha',
        targetWorkspaceId: 'workspace_beta',
      }),
    ).rejects.toThrow(/outside the expected tenant boundary/i)
  })

  it('rejects actingFor when caller validation fails', async () => {
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
      readSharedSecretWebhookBody({
        signature: 'shared-secret',
        secret: 'shared-secret',
        readBody: async () => ({ title: 'Deploy' }),
        parse: (body) => ({ ...body, title: body.title.toUpperCase() }),
      }),
    ).resolves.toEqual({ title: 'DEPLOY' })
  })

  it('rejects invalid webhook signatures', async () => {
    await expect(
      readSharedSecretWebhookBody({
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
      readSharedSecretWebhookBody({
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

describe('HMAC webhook helper', () => {
  it('binds signatures to raw body, timestamp, and delivery id', async () => {
    const timestamp = '1700000000'
    const deliveryId = 'evt_123'
    const rawBody = JSON.stringify({ title: 'Deploy' })
    const signature = createWebhookHmacSignature({
      secret: 'webhook-secret',
      timestamp,
      deliveryId,
      rawBody,
    })

    expect(
      isWebhookHmacSignatureValid({
        signature,
        timestamp,
        deliveryId,
        rawBody,
        secret: 'webhook-secret',
        nowMs: 1_700_000_000_000,
      }),
    ).toBe(true)
    expect(
      isWebhookHmacSignatureValid({
        signature,
        timestamp,
        deliveryId,
        rawBody: JSON.stringify({ title: 'Other' }),
        secret: 'webhook-secret',
        nowMs: 1_700_000_000_000,
      }),
    ).toBe(false)
  })

  it('rejects stale HMAC webhooks and replayed deliveries', async () => {
    const timestamp = '1700000000'
    const deliveryId = 'evt_123'
    const rawBody = '{}'
    const signature = createWebhookHmacSignature({
      secret: 'webhook-secret',
      timestamp,
      deliveryId,
      rawBody,
    })

    await expect(
      readHmacVerifiedWebhookBody({
        signature,
        timestamp,
        deliveryId,
        rawBody,
        secret: 'webhook-secret',
        nowMs: 1_700_000_600_000,
        parse: () => ({}),
      }),
    ).rejects.toMatchObject({ statusCode: 401 })

    await expect(
      readHmacVerifiedWebhookBody({
        signature,
        timestamp,
        deliveryId,
        rawBody,
        secret: 'webhook-secret',
        nowMs: 1_700_000_000_000,
        parse: () => ({}),
        idempotency: {
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

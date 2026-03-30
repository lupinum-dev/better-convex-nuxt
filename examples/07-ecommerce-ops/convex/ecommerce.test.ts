/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi
const SERVICE_KEY = 'test-service-key'

function createCtx() {
  return createTestContext({
    schema,
    modules,
    serviceKey: SERVICE_KEY,
    tenant: {
      table: 'workspaces',
      field: 'workspaceId',
    },
    users: {
      table: 'users',
      authField: 'authId',
      roleField: 'role',
      tenantField: 'workspaceId',
      nameField: 'displayName',
      emailField: 'email',
    },
  })
}

describe('ecommerce example', () => {
  it('denies an invalid service key', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    const orderId = await team.users.owner.mutation(api.orders.seedDemoOrders, {})

    await expect(
      ctx.raw.mutation(api.webhooks.processRefundWebhook, {
        serviceKey: 'wrong-key',
        workspaceId: team.id,
        orderId,
        eventId: 'evt-1',
        reason: 'Chargeback',
      }),
    ).rejects.toThrow('Invalid service key.')
  })

  it('denies duplicate webhook events', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    const orderId = await team.users.owner.mutation(api.orders.seedDemoOrders, {})

    await ctx.raw.mutation(api.webhooks.processRefundWebhook, {
      serviceKey: SERVICE_KEY,
      workspaceId: team.id,
      orderId,
      eventId: 'evt-duplicate',
      reason: 'Chargeback',
    })

    await expect(
      ctx.raw.mutation(api.webhooks.processRefundWebhook, {
        serviceKey: SERVICE_KEY,
        workspaceId: team.id,
        orderId,
        eventId: 'evt-duplicate',
        reason: 'Chargeback',
      }),
    ).rejects.toThrow('Event already processed.')
  })

  it('applies refund guards to human actors', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    await team.users.owner.mutation(api.orders.seedDemoOrders, {})
    const orders = await team.users.owner.query(api.orders.list, {})
    const pendingOrder = orders.find(order => order.status === 'pending')

    await expect(
      team.users.owner.mutation(api.orders.processRefund, {
        orderId: pendingOrder!._id,
        reason: 'Should fail',
      }),
    ).rejects.toThrow('Cannot refund unfulfilled orders.')
  })

  it('applies refund guards to service actors', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    await team.users.owner.mutation(api.orders.seedDemoOrders, {})
    const orders = await team.users.owner.query(api.orders.list, {})
    const pendingOrder = orders.find(order => order.status === 'pending')

    await expect(
      ctx.raw.mutation(api.webhooks.processRefundWebhook, {
        serviceKey: SERVICE_KEY,
        workspaceId: team.id,
        orderId: pendingOrder!._id,
        eventId: 'evt-pending',
        reason: 'Should fail',
      }),
    ).rejects.toThrow('Cannot refund unfulfilled orders.')
  })

  it('returns permission context booleans for owners and viewers', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can['order.refund']).toBe(true)
    expect(viewerCtx?.can['order.refund']).toBe(false)
    expect(viewerCtx?.can['order.read']).toBe(true)
  })

  it('returns null context and rejects protected order queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.orders.list, {})).rejects.toThrow('Forbidden: Read orders')
  })

  it('denies refunds outside the 30 day window', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    await team.users.owner.mutation(api.orders.seedDemoOrders, {})
    const orders = await team.users.owner.query(api.orders.list, {})
    const fulfilledOrder = orders.find(order => order.status === 'fulfilled')

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(fulfilledOrder!._id, {
        fulfilledAt: Date.now() - (31 * 24 * 60 * 60 * 1000),
      } as never)
    })

    await expect(
      team.users.owner.mutation(api.orders.processRefund, {
        orderId: fulfilledOrder!._id,
        reason: 'Too late',
      }),
    ).rejects.toThrow('Refund window has closed')
  })

  it('denies already refunded orders', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    await team.users.owner.mutation(api.orders.seedDemoOrders, {})
    const orders = await team.users.owner.query(api.orders.list, {})
    const fulfilledOrder = orders.find(order => order.status === 'fulfilled')

    await team.users.owner.mutation(api.orders.processRefund, {
      orderId: fulfilledOrder!._id,
      reason: 'First refund',
    })

    await expect(
      team.users.owner.mutation(api.orders.processRefund, {
        orderId: fulfilledOrder!._id,
        reason: 'Second refund',
      }),
    ).rejects.toThrow('Already refunded.')
  })

  it('denies orders under an unresolved fraud hold', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    const orderId = await team.users.owner.mutation(api.orders.seedDemoOrders, {})
    await ctx.seed('fraudHolds', {
      workspaceId: team.id,
      orderId,
      createdAt: Date.now(),
    })

    await expect(
      team.users.owner.mutation(api.orders.processRefund, {
        orderId,
        reason: 'Should fail',
      }),
    ).rejects.toThrow('Order is under fraud review.')
  })

  it('fails closed when the service key env var is missing', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Store',
      users: { owner: { role: 'owner' } },
    })

    const orderId = await team.users.owner.mutation(api.orders.seedDemoOrders, {})
    const previous = process.env.CONVEX_SERVICE_KEY
    delete process.env.CONVEX_SERVICE_KEY

    try {
      await expect(
        ctx.raw.mutation(api.webhooks.processRefundWebhook, {
          serviceKey: SERVICE_KEY,
          workspaceId: team.id,
          orderId,
          eventId: 'evt-missing-env',
          reason: 'Chargeback',
        }),
      ).rejects.toThrow('CONVEX_SERVICE_KEY must be set')
    }
    finally {
      if (previous === undefined) delete process.env.CONVEX_SERVICE_KEY
      else process.env.CONVEX_SERVICE_KEY = previous
    }
  })
})

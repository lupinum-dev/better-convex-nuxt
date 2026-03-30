/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

vi.mock('./_generated/server', async () => {
  const server = await import('convex/server')
  return {
    query: server.query,
    mutation: server.mutation,
    action: server.action,
    internalQuery: server.internalQuery,
    internalMutation: server.internalMutation,
    internalAction: server.internalAction,
    httpAction: server.httpAction,
  }
})

function createCtx() {
  return createTestContext({
    schema,
    modules,
    serviceKey: 'example-service-key',
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
      serviceKey: 'example-service-key',
      workspaceId: team.id,
      orderId,
      eventId: 'evt-duplicate',
      reason: 'Chargeback',
    })

    await expect(
      ctx.raw.mutation(api.webhooks.processRefundWebhook, {
        serviceKey: 'example-service-key',
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
        serviceKey: 'example-service-key',
        workspaceId: team.id,
        orderId: pendingOrder!._id,
        eventId: 'evt-pending',
        reason: 'Should fail',
      }),
    ).rejects.toThrow('Cannot refund unfulfilled orders.')
  })
})

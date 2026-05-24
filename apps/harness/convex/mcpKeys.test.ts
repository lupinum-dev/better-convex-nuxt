import { createHash } from 'node:crypto'

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

async function setupAuthorizedUser() {
  const t = convexTest(schema, modules)
  let userId!: Id<'users'>

  await t.run(async (ctx) => {
    userId = await ctx.db.insert('users', {
      authKey: 'user_admin',
      role: 'admin',
      displayName: 'Admin User',
      email: 'admin@test.com',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  const organizationId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('organizations', {
      name: 'Test Org',
      slug: 'test-org',
      ownerId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await ctx.db.patch(userId, {
      organizationId: id,
      updatedAt: Date.now(),
    })

    return id
  })

  return {
    organizationId,
    userId,
    asAdmin: t.withIdentity({ subject: 'user_admin', tokenIdentifier: 'user_admin' }),
  }
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

describe('mcpKeys', () => {
  it('exposes camel-cased Convex function references for the client', () => {
    const functionNameSymbol = Symbol.for('functionName')

    expect(api.mcpKeys.list[functionNameSymbol]).toBe('mcpKeys:list')
    expect(api.mcpKeys.create[functionNameSymbol]).toBe('mcpKeys:create')
    expect(api.mcpKeys.revoke[functionNameSymbol]).toBe('mcpKeys:revoke')
  })

  it('creates, lists, validates, and revokes MCP keys', async () => {
    const { asAdmin, organizationId, userId } = await setupAuthorizedUser()

    const created = await asAdmin.mutation(api.mcpKeys.create, {
      name: 'Claude Desktop',
      role: 'member',
    })

    expect(created.key.startsWith('mcp_')).toBe(true)

    const keys = await asAdmin.query(api.mcpKeys.list, {})
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({
      _id: created.id,
      name: 'Claude Desktop',
      role: 'member',
      status: 'active',
      userId,
      organizationId,
    })

    const validated = await asAdmin.query(api.mcpKeys.validate, { keyHash: hashKey(created.key) })
    expect(validated).toMatchObject({
      role: 'member',
      userId,
      workspaceId: organizationId,
    })

    await asAdmin.mutation(api.mcpKeys.revoke, { id: created.id })

    const revokedKeys = await asAdmin.query(api.mcpKeys.list, {})
    expect(revokedKeys[0]).toMatchObject({
      _id: created.id,
      status: 'revoked',
    })
    expect(revokedKeys[0]?.revokedAt).toEqual(expect.any(Number))

    const rejected = await asAdmin.query(api.mcpKeys.validate, { keyHash: hashKey(created.key) })
    expect(rejected).toBeNull()
  })

  it('updates lastUsedAt when a valid key is touched', async () => {
    const { asAdmin } = await setupAuthorizedUser()

    const created = await asAdmin.mutation(api.mcpKeys.create, {
      name: 'CI Pipeline',
      role: 'admin',
    })

    await asAdmin.mutation(api.mcpKeys.touch, { keyHash: hashKey(created.key) })

    const keys = await asAdmin.query(api.mcpKeys.list, {})
    expect(keys[0]?.lastUsedAt).toEqual(expect.any(Number))
  })
})

import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import { initConvexTest, modules } from '../convex/test.setup'

export const mcpServerSecret = 'mcp-agent-local-proof-server-secret-1234'
export const serviceBearerToken = 'proof-token'
export const serviceBearerHash = '212d8651fdb80e01215f5fdcea2b4ce0affbe32fe085937fb69ba26fd8ffa13c'

export function setMcpServerSecret(value = mcpServerSecret) {
  const previous = process.env.MCP_SERVER_SECRET
  process.env.MCP_SERVER_SECRET = value
  return () => {
    if (previous === undefined) {
      delete process.env.MCP_SERVER_SECRET
    } else {
      process.env.MCP_SERVER_SECRET = previous
    }
  }
}

export function convexTest(_schema = schema, _modules = modules) {
  return initConvexTest()
}

export type TestConvex = ReturnType<typeof initConvexTest>

export function readRateLimitError(error: unknown) {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return null
  }

  let data = error.data
  while (typeof data === 'string') {
    data = JSON.parse(data)
  }

  if (!data || typeof data !== 'object' || !('kind' in data) || data.kind !== 'RateLimited') {
    return null
  }

  return data
}

export async function seedActor(
  t: TestConvex,
  role: 'admin' | 'member' | 'viewer',
  status: 'active' | 'revoked' = 'active',
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      createdAt: Date.now(),
    })
    const serviceActorId = await ctx.db.insert('serviceActors', {
      organizationId,
      name: 'MCP',
      role,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const credentialId = await ctx.db.insert('agentCredentials', {
      organizationId,
      serviceActorId,
      secretHash: serviceBearerHash,
      status: 'active',
      createdAt: Date.now(),
    })
    return { organizationId, serviceActorId, credentialId }
  })
}

export async function seedHumanMember(
  t: TestConvex,
  organizationId: Id<'organizations'>,
  subject: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
  status: 'active' | 'removed' = 'active',
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      subject,
      name: subject,
      email: `${subject}@example.com`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return userId
  })
}

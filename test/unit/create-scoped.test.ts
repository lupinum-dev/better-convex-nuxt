import { describe, expect, it, vi } from 'vitest'

import { createScoped } from '../../src/runtime/scoping/create-scoped'

function createQueryCtx() {
  return {
    db: {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
      }),
      get: vi.fn(),
    },
  }
}

function createMutationCtx() {
  return {
    db: {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
      }),
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
    },
  }
}

describe('createScoped', () => {
  const requireActor = vi.fn(async () => ({
    userId: 'user_1',
    role: 'member',
    orgId: 'org_1',
  }))
  const tryResolveActor = vi.fn(async () => ({
    userId: 'user_1',
    role: 'member',
    orgId: 'org_1',
  }))

  it('returns a scoped reader for queries', async () => {
    const scoped = createScoped({
      requireActor,
      tryResolveActor,
      scopedTables: ['posts'],
    })

    const result = await scoped(createQueryCtx() as never, {})
    expect(result.actor.orgId).toBe('org_1')
    expect(result.db.query).toBeTypeOf('function')
    expect(result.raw.db.get).toBeTypeOf('function')
  })

  it('returns a scoped writer for mutations', async () => {
    const scoped = createScoped({
      requireActor,
      tryResolveActor,
      scopedTables: ['posts'],
    })

    const result = await scoped(createMutationCtx() as never, {})
    expect(result.db.insert).toBeTypeOf('function')
    expect(result.raw.db.insert).toBeTypeOf('function')
  })

  it('returns null from scoped.try when actor is missing or has no org', async () => {
    const scoped = createScoped({
      requireActor,
      tryResolveActor: async () => ({ userId: 'user_1', role: 'member' }),
      scopedTables: ['posts'],
    })

    await expect(scoped.try(createQueryCtx() as never, {})).resolves.toBeNull()
  })
})

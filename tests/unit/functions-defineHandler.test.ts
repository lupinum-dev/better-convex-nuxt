import { describe, expect, it, vi } from 'vitest'

import { authRequired, defineGuard, open } from '../../src/runtime/auth'
import { buildStructuredFunctions } from '../../src/runtime/functions/define-handler'

type Principal = { kind: 'anonymous' } | { kind: 'user'; userId: string }
type Actor = { userId: string; role: string } | null

type TestCtx = {
  principal: () => Promise<Principal>
  actor: () => Promise<Actor>
  marker: string
}

type BuiltHandler = ReturnType<ReturnType<typeof createBuilder>>

function createBuilder() {
  return (definition: {
    args: Record<string, unknown>
    handler: (ctx: TestCtx, args: Record<string, unknown>) => unknown
  }) => definition
}

describe('buildStructuredFunctions', () => {
  it('requires a guard and narrows actor for protected handlers at runtime', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<Actor>('dashboard.read', (actor) => !!actor && actor.role === 'admin')

    const query = handlers.query({
      args: {},
      guard,
      handler: async (ctx) => {
        return {
          actor: await ctx.actor(),
          marker: ctx.marker,
        }
      },
    }) as BuiltHandler

    const result = await query.handler(
      {
        principal: async () => ({ kind: 'user', userId: 'alice' }),
        actor: async () => ({ userId: 'alice', role: 'admin' }),
        marker: 'ok',
      },
      {},
    )

    expect(result).toEqual({
      actor: { userId: 'alice', role: 'admin' },
      marker: 'ok',
    })
  })

  it('rejects protected handlers before business logic runs', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<Actor>('dashboard.read', (actor) => !!actor && actor.role === 'admin')
    let called = false

    const query = handlers.query({
      args: {},
      guard,
      handler: async () => {
        called = true
        return null
      },
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          principal: async () => ({ kind: 'user', userId: 'alice' }),
          actor: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'nope',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: dashboard.read/)

    expect(called).toBe(false)
  })

  it('supports public handlers via open', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )

    const query = handlers.query({
      args: {},
      guard: open,
      handler: async (ctx) => await ctx.actor(),
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          principal: async () => ({ kind: 'anonymous' }),
          actor: async () => null,
          marker: 'public',
        },
        {},
      ),
    ).resolves.toBeNull()
  })

  it('does not resolve actor eagerly for open handlers that never touch actor()', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )
    const actor = vi.fn(async () => {
      throw new Error('actor should stay lazy')
    })

    const query = handlers.query({
      args: {},
      guard: open,
      handler: async (ctx) => ({ principal: await ctx.principal(), marker: ctx.marker }),
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          principal: async () => ({ kind: 'anonymous' }),
          actor,
          marker: 'public',
        },
        {},
      ),
    ).resolves.toEqual({
      principal: { kind: 'anonymous' },
      marker: 'public',
    })

    expect(actor).not.toHaveBeenCalled()
  })

  it('supports separate load and authorize phases', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<Actor>('todo.read', (actor) => !!actor)

    const mutation = handlers.mutation({
      args: {},
      guard,
      load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
      authorize: {
        label: 'todo.update',
        check: (actor, loaded) => actor.userId === loaded.todo.ownerId,
      },
      handler: async (_ctx, _args, loaded) => loaded.todo.title,
    }) as BuiltHandler

    await expect(
      mutation.handler(
        {
          principal: async () => ({ kind: 'user', userId: 'bob' }),
          actor: async () => ({ userId: 'bob', role: 'member' }),
          marker: 'blocked',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: todo.update/)

    await expect(
      mutation.handler(
        {
          principal: async () => ({ kind: 'user', userId: 'alice' }),
          actor: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'allowed',
        },
        {},
      ),
    ).resolves.toBe('Hello')
  })

  it('requires a resolved actor for authRequired handlers', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )

    const query = handlers.query({
      args: {},
      guard: authRequired,
      handler: async (ctx) => ({
        principal: await ctx.principal(),
        actor: await ctx.actor(),
      }),
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          principal: async () => ({ kind: 'user', userId: 'alice' }),
          actor: async () => null,
          marker: 'auth-only',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)

    await expect(
      query.handler(
        {
          principal: async () => ({ kind: 'user', userId: 'alice' }),
          actor: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'auth-only',
        },
        {},
      ),
    ).resolves.toEqual({
      principal: { kind: 'user', userId: 'alice' },
      actor: { userId: 'alice', role: 'member' },
    })

    await expect(
      query.handler(
        {
          principal: async () => ({ kind: 'anonymous' }),
          actor: async () => null,
          marker: 'anon',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)
  })

  it('rejects anonymous authRequired handlers before actor resolution runs', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )
    const actor = vi.fn(async () => {
      throw new Error('actor should not resolve for anonymous authRequired guard')
    })

    const query = handlers.query({
      args: {},
      guard: authRequired,
      handler: async () => 'never',
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          principal: async () => ({ kind: 'anonymous' }),
          actor,
          marker: 'anon',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)

    expect(actor).not.toHaveBeenCalled()
  })

  it('runs authRequired before load and authorize when actor is missing', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )

    const mutation = handlers.mutation({
      args: {},
      guard: authRequired,
      load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
      authorize: {
        label: 'todo.preview',
        check: (actor, loaded, _args, ctx) => {
          void ctx
          return actor?.userId === loaded.todo.ownerId
        },
      },
      handler: async (_ctx, _args, loaded) => loaded.todo.title,
    }) as BuiltHandler

    await expect(
      mutation.handler(
        {
          principal: async () => ({ kind: 'user', userId: 'alice' }),
          actor: async () => null,
          marker: 'blocked',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)

    await expect(
      mutation.handler(
        {
          principal: async () => ({ kind: 'user', userId: 'alice' }),
          actor: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'allowed',
        },
        {},
      ),
    ).resolves.toBe('Hello')
  })

  it('throws clearly when context is missing principal()', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
      createBuilder(),
      createBuilder(),
    )

    const query = handlers.query({
      args: {},
      guard: open,
      handler: async () => null,
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          actor: async () => null,
          marker: 'broken',
        } as unknown as TestCtx,
        {},
      ),
    ).rejects.toThrow(/missing principal\(\) accessor/)
  })
})

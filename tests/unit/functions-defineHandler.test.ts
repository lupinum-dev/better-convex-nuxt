import { afterEach, describe, expect, it, vi } from 'vitest'

import { authRequired, defineGuard, open } from '../../src/runtime/auth'
import { buildStructuredFunctions } from '../../src/runtime/functions/define-handler'

type Caller = { kind: 'anonymous' } | { kind: 'user'; userId: string }
type AppIdentity = { userId: string; role: string } | null

type TestCtx = {
  caller: () => Promise<Caller>
  appIdentity: () => Promise<AppIdentity>
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
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires a guard and narrows appIdentity for protected handlers at runtime', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>(
      'dashboard.read',
      (appIdentity) => !!appIdentity && appIdentity.role === 'admin',
    )

    const query = handlers.query({
      args: {},
      guard,
      handler: async (ctx) => {
        return {
          appIdentity: await ctx.appIdentity(),
          marker: ctx.marker,
        }
      },
    }) as BuiltHandler

    const result = await query.handler(
      {
        caller: async () => ({ kind: 'user', userId: 'alice' }),
        appIdentity: async () => ({ userId: 'alice', role: 'admin' }),
        marker: 'ok',
      },
      {},
    )

    expect(result).toEqual({
      appIdentity: { userId: 'alice', role: 'admin' },
      marker: 'ok',
    })
  })

  it('rejects protected handlers before business logic runs', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>(
      'dashboard.read',
      (appIdentity) => !!appIdentity && appIdentity.role === 'admin',
    )
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
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'nope',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: dashboard.read/)

    expect(called).toBe(false)
  })

  it('supports public handlers via open', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )

    const query = handlers.query({
      args: {},
      guard: open,
      handler: async (ctx) => await ctx.appIdentity(),
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'anonymous' }),
          appIdentity: async () => null,
          marker: 'public',
        },
        {},
      ),
    ).resolves.toBeNull()
  })

  it('does not resolve appIdentity eagerly for open handlers that never touch appIdentity()', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const appIdentity = vi.fn(async () => {
      throw new Error('appIdentity should stay lazy')
    })

    const query = handlers.query({
      args: {},
      guard: open,
      handler: async (ctx) => ({ caller: await ctx.caller(), marker: ctx.marker }),
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'anonymous' }),
          appIdentity,
          marker: 'public',
        },
        {},
      ),
    ).resolves.toEqual({
      caller: { kind: 'anonymous' },
      marker: 'public',
    })

    expect(appIdentity).not.toHaveBeenCalled()
  })

  it('does not require appIdentity wiring for open handlers that never touch appIdentity()', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )

    const query = handlers.query({
      args: {},
      guard: open,
      handler: async (ctx) => ({ caller: await ctx.caller(), marker: ctx.marker }),
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'anonymous' }),
          marker: 'public',
        } as unknown as TestCtx,
        {},
      ),
    ).resolves.toEqual({
      caller: { kind: 'anonymous' },
      marker: 'public',
    })
  })

  it('supports separate load and authorize phases', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>('todo.read', (appIdentity) => !!appIdentity)

    const mutation = handlers.mutation({
      args: {},
      guard,
      load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
      authorize: {
        label: 'todo.update',
        check: (appIdentity, loaded) => appIdentity.userId === loaded.todo.ownerId,
      },
      handler: async (_ctx, _args, loaded) => loaded.todo.title,
    }) as BuiltHandler

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'bob' }),
          appIdentity: async () => ({ userId: 'bob', role: 'member' }),
          marker: 'blocked',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: todo.update/)

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'allowed',
        },
        {},
      ),
    ).resolves.toBe('Hello')
  })

  it('does not infer one-argument authorize functions as loaded-resource factories', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>('todo.read', (appIdentity) => !!appIdentity)

    const mutation = handlers.mutation({
      args: {},
      guard,
      load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
      authorize: ((appIdentity: AppIdentity) =>
        Boolean((appIdentity as { todo?: { ownerId: string } } | null)?.todo)) as unknown as (
        appIdentity: AppIdentity,
      ) => boolean,
      handler: async (_ctx, _args, loaded) => loaded.todo.title,
    }) as BuiltHandler

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'bob' }),
          appIdentity: async () => ({ userId: 'bob', role: 'member' }),
          marker: 'blocked',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: Access denied/)

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'allowed',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: Access denied/)
  })

  it('supports explicit authorize objects for loaded-resource checks', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>('todo.read', (appIdentity) => !!appIdentity)

    const mutation = handlers.mutation({
      args: {},
      guard,
      load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
      authorize: {
        label: 'todo.update',
        check: (_actor, { todo }) =>
          defineGuard<NonNullable<AppIdentity>>(
            'todo.update',
            (appIdentity) => appIdentity.userId === todo.ownerId,
          ),
      },
      handler: async (_ctx, _args, loaded) => loaded.todo.title,
    }) as BuiltHandler

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'bob' }),
          appIdentity: async () => ({ userId: 'bob', role: 'member' }),
          marker: 'blocked',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: todo.update/)

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'allowed',
        },
        {},
      ),
    ).resolves.toBe('Hello')
  })

  it('supports inline appIdentity-and-loaded authorize checks', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>('todo.read', (appIdentity) => !!appIdentity)

    const mutation = handlers.mutation({
      args: {},
      guard,
      load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
      authorize: (appIdentity, { todo }) => appIdentity.userId === todo.ownerId,
      handler: async (_ctx, _args, loaded) => loaded.todo.title,
    }) as BuiltHandler

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'bob' }),
          appIdentity: async () => ({ userId: 'bob', role: 'member' }),
          marker: 'blocked',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: Access denied/)

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'allowed',
        },
        {},
      ),
    ).resolves.toBe('Hello')
  })

  it('requires a resolved appIdentity for authRequired handlers', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )

    const query = handlers.query({
      args: {},
      guard: authRequired,
      handler: async (ctx) => ({
        caller: await ctx.caller(),
        appIdentity: await ctx.appIdentity(),
      }),
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => null,
          marker: 'auth-only',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'auth-only',
        },
        {},
      ),
    ).resolves.toEqual({
      caller: { kind: 'user', userId: 'alice' },
      appIdentity: { userId: 'alice', role: 'member' },
    })

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'anonymous' }),
          appIdentity: async () => null,
          marker: 'anon',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)
  })

  it('rejects anonymous authRequired handlers before appIdentity resolution runs', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const appIdentity = vi.fn(async () => {
      throw new Error('appIdentity should not resolve for anonymous authRequired guard')
    })

    const query = handlers.query({
      args: {},
      guard: authRequired,
      handler: async () => 'never',
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'anonymous' }),
          appIdentity,
          marker: 'anon',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)

    expect(appIdentity).not.toHaveBeenCalled()
  })

  it('runs authRequired before load and authorize when appIdentity is missing', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )

    const mutation = handlers.mutation({
      args: {},
      guard: authRequired,
      load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
      authorize: {
        label: 'todo.preview',
        check: (appIdentity, loaded, _args, ctx) => {
          void ctx
          return appIdentity?.userId === loaded.todo.ownerId
        },
      },
      handler: async (_ctx, _args, loaded) => loaded.todo.title,
    }) as BuiltHandler

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => null,
          marker: 'blocked',
        },
        {},
      ),
    ).rejects.toThrow(/Forbidden: authRequired/)

    await expect(
      mutation.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          appIdentity: async () => ({ userId: 'alice', role: 'member' }),
          marker: 'allowed',
        },
        {},
      ),
    ).resolves.toBe('Hello')
  })

  it('throws clearly when protected handlers need appIdentity wiring but context is missing appIdentity()', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>(
      'dashboard.read',
      (appIdentity) => !!appIdentity && appIdentity.role === 'admin',
    )

    const query = handlers.query({
      args: {},
      guard,
      handler: async () => 'never',
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          marker: 'broken',
        } as unknown as TestCtx,
        {},
      ),
    ).rejects.toThrow(/missing appIdentity\(\) accessor/)
  })

  it('treats missing appIdentity wiring as fail-closed denial in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
      createBuilder(),
      createBuilder(),
    )
    const guard = defineGuard<AppIdentity>(
      'dashboard.read',
      (appIdentity) => !!appIdentity && appIdentity.role === 'admin',
    )

    const query = handlers.query({
      args: {},
      guard,
      handler: async () => 'never',
    }) as BuiltHandler

    await expect(
      query.handler(
        {
          caller: async () => ({ kind: 'user', userId: 'alice' }),
          marker: 'broken',
        } as unknown as TestCtx,
        {},
      ),
    ).rejects.toThrow(/Forbidden: dashboard\.read/)
  })

  it('throws clearly when context is missing caller()', async () => {
    const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
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
          appIdentity: async () => null,
          marker: 'broken',
        } as unknown as TestCtx,
        {},
      ),
    ).rejects.toThrow(/missing caller\(\) accessor/)
  })
})

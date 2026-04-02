import { convexTest } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { setupTestWithTwoOrgs } from './test.helpers'
import { modules } from './test.setup'

describe('createFunctions', () => {
  beforeEach(() => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'test-trusted-caller-key'
  })

  it('does not resolve the actor when a handler never calls ctx.actor()', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    await expect(t.query(api.functionsProbe.publicWithoutActor, {})).resolves.toEqual({
      actorResolverCalls: 0,
    })
  })

  it('memoizes ctx.actor() within one invocation but not across separate calls', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        authId: 'memo_user',
        role: 'member',
        displayName: 'Memo User',
        email: 'memo@test.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.query(api.functionsProbe.actorMemoization, {
        _trustedCallerKey: 'test-trusted-caller-key',
        _trustedCaller: { userId: 'memo_user' },
      }),
    ).resolves.toMatchObject({
      before: 0,
      after: 1,
      sameReference: true,
      actor: {
        kind: 'user',
        userId: 'memo_user',
        role: 'member',
      },
    })

    await expect(
      t.query(api.functionsProbe.actorMemoization, {
        _trustedCallerKey: 'test-trusted-caller-key',
        _trustedCaller: { userId: 'memo_user' },
      }),
    ).resolves.toMatchObject({
      before: 1,
      after: 2,
      sameReference: true,
    })
  })

  it('strips hidden trusted-caller args before the handler sees args', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    await expect(
      t.query(api.functionsProbe.echoedArgs, {
        title: 'hello',
        _trustedCallerKey: 'test-trusted-caller-key',
        _trustedCaller: { userId: 'echo_user' },
      }),
    ).resolves.toEqual({
      title: 'hello',
    })
  })

  it('rejects invalid trusted caller credentials through the builder path', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    await expect(
      t.query(api.functionsProbe.actorMemoization, {
        _trustedCallerKey: 'wrong-key',
        _trustedCaller: { userId: 'memo_user' },
      }),
    ).rejects.toThrow('Invalid trusted caller credentials.')
  })

  it('uses tenant isolation as defense in depth for unsafe reads and writes', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const postId = await asUser1.mutation(api.posts.create, {
      title: 'Org 1 only',
      content: 'secret',
    })

    await expect(asUser2.query(api.functionsProbe.unsafeListPosts, {})).rejects.toThrow(
      'Document belongs to a different tenant.',
    )

    await expect(
      asUser2.mutation(api.functionsProbe.unsafeRenamePost, {
        id: postId,
        title: 'hijacked',
      }),
    ).rejects.toThrow('Document belongs to a different tenant.')
  })

  it('wraps mutation db access with triggers when configured', async () => {
    const t = convexTest(schema, modules)

    const noteId = await t.mutation(api.functionsProbe.createTriggeredNote, {
      content: 'hello',
    })

    await expect(t.query(api.functionsProbe.getNote, { id: noteId })).resolves.toMatchObject({
      _id: noteId,
      content: 'hello',
      title: 'triggered',
    })
  })
})

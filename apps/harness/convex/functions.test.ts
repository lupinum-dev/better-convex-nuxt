import { createHash } from 'node:crypto'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { withObservationEnvelope } from '../../../src/runtime/utils/observability'
import { api } from './_generated/api'
import schema from './schema'
import {
  INTERNAL_HARNESS_TEST_TRUSTED_CALLER_KEY,
  setupTestWithMultipleUsers,
  setupTestWithTwoOrgs,
  withTrustedPrincipal,
} from './test.helpers'
import { modules } from './test.setup'

describe('defineTrellis', () => {
  process.env.CONVEX_TRUSTED_CALLER_KEY = INTERNAL_HARNESS_TEST_TRUSTED_CALLER_KEY

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
      t.query(
        api.functionsProbe.actorMemoization,
        withTrustedPrincipal({}, { kind: 'user', userId: 'memo_user' }),
      ),
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
      t.query(
        api.functionsProbe.actorMemoization,
        withTrustedPrincipal({}, { kind: 'user', userId: 'memo_user' }),
      ),
    ).resolves.toMatchObject({
      before: 1,
      after: 2,
      sameReference: true,
    })
  })

  it('strips hidden principal args before the handler sees args', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    await expect(
      t.query(
        api.functionsProbe.echoedArgs,
        withTrustedPrincipal({ title: 'hello' }, { kind: 'user', userId: 'echo_user' }),
      ),
    ).resolves.toEqual({
      title: 'hello',
    })
  })

  it('strips the internal __trellis envelope before structured phases and onSuccess hooks', async () => {
    const { asOwner } = await setupTestWithMultipleUsers()

    await expect(
      asOwner.query(
        api.functionsProbe.structuredEnvelopeProbe,
        withObservationEnvelope(
          { title: 'hello structured' },
          { correlationId: 'corr_structured', originTransport: 'mcp' },
        ) as never,
      ),
    ).resolves.toEqual({
      args: { title: 'hello structured' },
      loaded: { echoedTitle: 'hello structured' },
    })

    await expect(
      asOwner.query(
        api.functionsProbe.onSuccessEnvelopeProbe,
        withObservationEnvelope(
          { marker: 'success-probe' },
          { correlationId: 'corr_success', originTransport: 'nuxt-server' },
        ) as never,
      ),
    ).resolves.toEqual({
      ok: true,
      marker: 'success-probe',
    })

    await expect(asOwner.query(api.functionsProbe.getEnvelopeProbeState, {})).resolves.toEqual({
      structuredLoadArgs: { title: 'hello structured' },
      structuredAuthorizeArgs: { title: 'hello structured' },
      structuredHandlerArgs: { title: 'hello structured' },
      onSuccessArgs: { marker: 'success-probe' },
    })
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

  it('fails closed when the actor and document both lack a tenant id', async () => {
    const t = convexTest(schema, modules)

    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        authId: 'no_org_user',
        role: 'member',
        displayName: 'No Org User',
        email: 'no-org@test.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      await ctx.db.insert('mcpKeys', {
        name: 'No Org Key',
        keyHash: createHash('sha256').update('mcp_no_org_key').digest('hex'),
        prefix: 'mcp_no_',
        role: 'member',
        userId: 'no_org_user',
        status: 'active',
        createdAt: Date.now(),
      })
    })

    const asNoOrgUser = t.withIdentity({ subject: 'no_org_user' })

    await expect(asNoOrgUser.query(api.functionsProbe.unsafeListMcpKeys, {})).rejects.toThrow(
      'Document belongs to a different tenant.',
    )
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

  it('supports structured public handlers alongside raw builders', async () => {
    const t = convexTest(schema, modules)

    await expect(t.query(api.functionsProbe.structuredPublicActorEcho, {})).resolves.toEqual({
      actor: null,
    })
  })

  it('supports structured load and authorize phases alongside raw builders', async () => {
    const { asOwner, asAdmin } = await setupTestWithMultipleUsers()

    const postId = await asOwner.mutation(api.posts.create, {
      title: 'Owned by owner',
      content: 'body',
    })

    await expect(
      asOwner.query(api.functionsProbe.structuredPostOwner, { id: postId }),
    ).resolves.toEqual({
      ownerId: 'user_owner',
    })

    await expect(
      asAdmin.query(api.functionsProbe.structuredPostOwner, { id: postId }),
    ).rejects.toThrow('Forbidden: probe.update')
  })

  it('runs tenant isolation before structured authorize on cross-tenant loads', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const postId = await asUser1.mutation(api.posts.create, {
      title: 'Owned by user 1',
      content: 'body',
    })

    await expect(
      asUser2.query(api.functionsProbe.structuredPostOwner, { id: postId }),
    ).rejects.toThrow('Document belongs to a different tenant.')
  })
})

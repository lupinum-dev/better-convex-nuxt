import { createHash } from 'node:crypto'

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { withObservationEnvelope } from '../../../src/runtime/observability'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  INTERNAL_HARNESS_TEST_IDENTITY_FORWARDING_KEY,
  setupTestWithMultipleUsers,
  setupTestWithTwoOrgs,
  withTrustedCaller,
} from './test.helpers'
import { modules } from './test.setup'

describe('defineTrellis', () => {
  process.env.CONVEX_IDENTITY_FORWARDING_KEY = INTERNAL_HARNESS_TEST_IDENTITY_FORWARDING_KEY

  it('does not resolve the appIdentity when a handler never calls ctx.appIdentity()', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    await expect(t.query(api.functionsProbe.publicWithoutActor, {})).resolves.toEqual({
      actorResolverCalls: 0,
    })
  })

  it('memoizes ctx.appIdentity() within one invocation but not across separate calls', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    let memoUserId!: Id<'users'>
    await t.run(async (ctx) => {
      memoUserId = await ctx.db.insert('users', {
        authKey: 'memo_user',
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
        withTrustedCaller(
          {},
          { kind: 'user', authKey: 'memo_user', subject: 'auth:memo_user' },
          null,
          api.functionsProbe.actorMemoization,
        ),
      ),
    ).resolves.toMatchObject({
      before: 0,
      after: 1,
      sameReference: true,
      appIdentity: {
        kind: 'user',
        userId: memoUserId,
        role: 'member',
      },
    })

    await expect(
      t.query(
        api.functionsProbe.actorMemoization,
        withTrustedCaller(
          {},
          { kind: 'user', authKey: 'memo_user', subject: 'auth:memo_user' },
          null,
          api.functionsProbe.actorMemoization,
        ),
      ),
    ).resolves.toMatchObject({
      before: 1,
      after: 2,
      sameReference: true,
    })
  })

  it('strips hidden caller args before the handler sees args', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.functionsProbe.resetActorResolverCalls, {})

    await expect(
      t.query(
        api.functionsProbe.identityForwardingStateProbe,
        withTrustedCaller(
          {},
          { kind: 'user', userId: 'echo_user', subject: 'user:echo_user' },
          null,
          api.functionsProbe.identityForwardingStateProbe,
        ),
      ),
    ).resolves.toMatchObject({
      identityForwarding: {
        principalSubject: 'user:echo_user',
      },
      forwardedCaller: {
        kind: 'user',
        userId: 'echo_user',
        subject: 'user:echo_user',
      },
    })

    await expect(
      t.query(
        api.functionsProbe.echoedArgs,
        withTrustedCaller(
          { title: 'hello' },
          { kind: 'user', userId: 'echo_user', subject: 'user:echo_user' },
          null,
          api.functionsProbe.echoedArgs,
        ),
      ),
    ).resolves.toEqual({
      title: 'hello',
    })
  })

  it('rejects forwarded identity on untrusted paths before unsafe resolvers can read raw args', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.query(api.functionsProbe.unsafeForwardedCallerProbe, {
        caller: {
          kind: 'user',
          userId: 'forged_user',
          subject: 'user:forged_user',
        },
      } as never),
    ).rejects.toThrow(/Unexpected field `caller`|Forwarded identity fields/)
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

  it('exposes validated actingFor through ctx.actingFor()', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.query(
        api.functionsProbe.structuredDelegationProbe,
        withTrustedCaller(
          {},
          { kind: 'agent', agentId: 'agent_1', subject: 'agent:agent_1', role: 'member' },
          { subject: 'user:delegated_user', reason: 'approved' },
          api.functionsProbe.structuredDelegationProbe,
        ),
      ),
    ).resolves.toEqual({
      actingFor: {
        subject: 'user:delegated_user',
        reason: 'approved',
      },
    })
  })

  it('uses isolation as defense in depth for unsafe reads and writes', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const postId = await asUser1.mutation(api.posts.create, {
      title: 'Org 1 only',
      content: 'secret',
    })

    await expect(asUser2.query(api.functionsProbe.unsafeListPosts, {})).rejects.toThrow(
      'Document belongs to a different isolation scope.',
    )

    await expect(
      asUser2.mutation(api.functionsProbe.unsafeRenamePost, {
        id: postId,
        title: 'hijacked',
      }),
    ).rejects.toThrow('Document belongs to a different isolation scope.')
  })

  it('fails closed when the appIdentity and document both lack a tenant id', async () => {
    const t = convexTest(schema, modules)

    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        authKey: 'no_org_user',
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

    const asNoOrgUser = t.withIdentity({
      subject: 'no_org_user',
      tokenIdentifier: 'no_org_user',
    })

    await expect(asNoOrgUser.query(api.functionsProbe.unsafeListMcpKeys, {})).rejects.toThrow(
      'Document belongs to a different isolation scope.',
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
      appIdentity: null,
    })
  })

  it('supports structured load and authorize phases alongside raw builders', async () => {
    const { asOwner, asAdmin, userIds } = await setupTestWithMultipleUsers()

    const postId = await asOwner.mutation(api.posts.create, {
      title: 'Owned by owner',
      content: 'body',
    })

    await expect(
      asOwner.query(api.functionsProbe.structuredPostOwner, { id: postId }),
    ).resolves.toEqual({
      ownerId: userIds.owner,
    })

    await expect(
      asAdmin.query(api.functionsProbe.structuredPostOwner, { id: postId }),
    ).rejects.toThrow('Forbidden: probe.update')
  })

  it('runs isolation before structured authorize on cross-scope loads', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const postId = await asUser1.mutation(api.posts.create, {
      title: 'Owned by user 1',
      content: 'body',
    })

    await expect(
      asUser2.query(api.functionsProbe.structuredPostOwner, { id: postId }),
    ).rejects.toThrow('Document belongs to a different isolation scope.')
  })
})

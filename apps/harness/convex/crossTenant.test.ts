/**
 * Integration tests for isolation runtime enforcement and
 * the `ctx.db.escapeIsolation(...)` / `unsafe.*` escape hatches.
 *
 * The default-db path (`ctx.db`) is already covered by posts.test.ts
 * (see "returns posts in users org only" and "surfaces a tenant
 * isolation violation for posts in different orgs during development").
 *
 * This file adds the missing pieces:
 *
 * 1. `ctx.db.escapeIsolation(...)` actually sees across-scopes
 * 2. `query.unsafe(...)`                 still respects isolation on plain `ctx.db`
 *
 * Together with posts.test.ts these prove the Spec §14 claim that
 * isolation is runtime-owned and enforced, not a convention.
 */
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import { setupTestWithTwoOrgs } from './test.helpers'

describe('isolation — ctx.db (default)', () => {
  it('throws on a direct get across-scopes (RLS is strict, not silent)', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const user1PostId = await asUser1.mutation(api.posts.create, {
      title: 'Org 1 Post',
      content: 'Content',
    })

    // Noteworthy contract: the RLS layer does NOT silently return null
    // on a cross-scope read; it raises. This is stricter than some
    // RLS implementations and is what the §14 "safer by construction"
    // claim rests on — handlers that forget to pre-filter by tenant
    // cannot accidentally leak other tenants' rows.
    await expect(asUser2.query(api.posts.get, { id: user1PostId })).rejects.toThrow(
      'Document belongs to a different isolation scope.',
    )
  })

  it('throws on a cross-scope mutation', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const user1PostId = await asUser1.mutation(api.posts.create, {
      title: 'Org 1 Post',
      content: 'Content',
    })

    await expect(
      asUser2.mutation(api.posts.update, { id: user1PostId, title: 'hacked' }),
    ).rejects.toThrow('Document belongs to a different isolation scope.')
  })

  it('rejects a cross-scope list with an empty result', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    await asUser1.mutation(api.posts.create, { title: 'Org 1 Post', content: '' })
    await asUser2.mutation(api.posts.create, { title: 'Org 2 Post', content: '' })

    const user1Posts = await asUser1.query(api.posts.list, {})
    const user2Posts = await asUser2.query(api.posts.list, {})

    expect(user1Posts).toHaveLength(1)
    expect(user2Posts).toHaveLength(1)
    expect(user1Posts[0]?.title).toBe('Org 1 Post')
    expect(user2Posts[0]?.title).toBe('Org 2 Post')
  })
})

describe('isolation — ctx.db.escapeIsolation', () => {
  it('can read posts from another tenant', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const user1PostId = await asUser1.mutation(api.posts.create, {
      title: 'Org 1 Post',
      content: 'Content',
    })

    // user2 lives in a different org. Default ctx.db would return
    // nothing; ctx.db.escapeIsolation crosses the boundary explicitly.
    const crossRead = await asUser2.query(api.crossTenant.getAnyPost, { id: user1PostId })

    expect(crossRead).not.toBeNull()
    expect(crossRead?.title).toBe('Org 1 Post')
  })

  it('lists posts across all tenants', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    await asUser1.mutation(api.posts.create, { title: 'A', content: '' })
    await asUser2.mutation(api.posts.create, { title: 'B', content: '' })

    const all = await asUser1.query(api.crossTenant.listAllPosts, {})
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.title).sort()).toEqual(['A', 'B'])
  })
})

describe('isolation — unsafe.query', () => {
  it('still rejects cross-scope reads when the handler uses plain ctx.db', async () => {
    const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

    const user1PostId = await asUser1.mutation(api.posts.create, {
      title: 'Raw Read',
      content: 'Content',
    })

    await expect(asUser2.query(api.crossTenant.getAnyPostRaw, { id: user1PostId })).rejects.toThrow(
      'Document belongs to a different isolation scope.',
    )
  })
})

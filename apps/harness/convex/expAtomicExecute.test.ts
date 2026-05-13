/**
 * Experiment 4: Atomic Execute Mutation — Tests
 *
 * Validates the 10-step destructive MCP flow runs atomically
 * inside a single Convex mutation transaction.
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

// Helper: seed an organization + post, returns { orgId, postId }
async function seedPost(t: ReturnType<typeof convexTest>, title = 'Test Post') {
  const orgId = await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Test Org',
      slug: 'test-org',
      ownerId: 'user_owner',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  const postId = await t.run(async (ctx) => {
    return await ctx.db.insert('posts', {
      title,
      content: 'Content to be deleted',
      status: 'published',
      ownerId: 'user_owner',
      organizationId: orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  return { orgId, postId }
}

describe('Exp 4: Atomic Execute Mutation', () => {
  it('happy path: preview → execute → post deleted, audit written, jti redeemed', async () => {
    const t = convexTest(schema, modules)

    // Seed a post
    const { postId } = await seedPost(t)

    // Preview
    const previewResult = await t.mutation(internal.expAtomicExecute.preview, { postId })
    expect(previewResult.preview.operation).toBe('deletePost')
    expect(previewResult.preview.targetTitle).toBe('Test Post')
    expect(previewResult.token).toBeTruthy()

    // Execute with the preview token
    const executeResult = await t.mutation(internal.expAtomicExecute.execute, {
      token: previewResult.token,
      postId,
    })
    expect(executeResult.success).toBe(true)
    expect(executeResult.deletedPostId).toBe(postId)
    expect(executeResult.auditWritten).toBe(true)

    // Verify post is actually gone
    const post = await t.run(async (ctx) => {
      return await ctx.db.get(postId)
    })
    expect(post).toBeNull()

    // Verify audit log was written
    const auditEntries = await t.run(async (ctx) => {
      return await ctx.db.query('expAuditLog').collect()
    })
    expect(auditEntries).toHaveLength(1)
    expect(auditEntries[0].operation).toBe('deletePost')
    expect(auditEntries[0].callerKey).toBe('mcp-test-caller')

    // Verify jti was redeemed
    const jtiEntries = await t.run(async (ctx) => {
      return await ctx.db.query('expJtiLog').collect()
    })
    expect(jtiEntries).toHaveLength(1)
  })

  it('replay attack: same token twice → second call throws "jti already redeemed"', async () => {
    const t = convexTest(schema, modules)
    const { postId } = await seedPost(t)

    // Preview + first execute (succeeds)
    const { token } = await t.mutation(internal.expAtomicExecute.preview, { postId })
    await t.mutation(internal.expAtomicExecute.execute, { token, postId })

    // Second execute with same token — post is already deleted,
    // but jti check should fire first. We need a new post for the
    // second call to not fail on "post not found" before jti check.
    // Actually, the argsHash uses the same postId, so let's seed another
    // post and create a new preview to get a fresh postId — but reuse the OLD token.
    // The jti replay check happens at step 7, after steps 1-6 pass.
    // Since the old post is deleted, step 5 would fail first.
    // So instead, let's seed a second post with the same title and
    // use the original token with the new postId — but that changes argsHash.
    //
    // Simplest approach: seed two posts, preview the first, execute first,
    // then try executing the same token against the first postId again.
    // Step 5 "post not found" fires before jti check.
    //
    // Best approach: two identical posts, preview+execute post1,
    // then use the token to try to delete post1 again — "post not found" at step 5.
    // We actually want the jti check to be the failure, so we need to
    // reach step 7. That means steps 1-6 must pass.
    //
    // Create two posts with same title. Preview post1. Execute post1 (deletes it).
    // Now re-seed post1 with same title so steps 4-6 can pass with the old token.
    // The token's argsHash was computed from the original postId though.
    //
    // Actually the simplest test: just run execute twice with the same token+postId.
    // First succeeds. For the second, the post is deleted, so it throws at step 5.
    // To isolate the jti check, we need a test where the post still exists.
    //
    // Let's test this differently: manually insert a jti entry, then try execute.
    const { postId: postId2 } = await seedPost(t, 'Test Post 2')
    const { token: token2 } = await t.mutation(internal.expAtomicExecute.preview, {
      postId: postId2,
    })

    // First execute succeeds
    await t.mutation(internal.expAtomicExecute.execute, { token: token2, postId: postId2 })

    // Seed another post with same title and try to abuse the token.
    // But really we just need to show that the jti is checked.
    // Seed a third post, preview it, manually insert the jti from the preview
    // token into the jti log, then try to execute — should fail at step 7.
    const { postId: postId3 } = await seedPost(t, 'Replay Target')
    const preview3 = await t.mutation(internal.expAtomicExecute.preview, { postId: postId3 })

    // Decode the JWT to extract the jti (without verification, just for test setup)
    const [, payloadB64] = preview3.token.split('.')
    const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))

    // Pre-insert the jti to simulate replay
    await t.run(async (ctx) => {
      await ctx.db.insert('expJtiLog', {
        jti: payloadJson.jti,
        redeemedAt: Date.now(),
      })
    })

    // Execute should fail with "jti already redeemed"
    await expect(
      t.mutation(internal.expAtomicExecute.execute, { token: preview3.token, postId: postId3 }),
    ).rejects.toThrow('jti already redeemed')

    // Verify the post was NOT deleted (atomic rollback)
    const post3 = await t.run(async (ctx) => {
      return await ctx.db.get(postId3)
    })
    expect(post3).not.toBeNull()
    expect(post3!.title).toBe('Replay Target')
  })

  it('preview drift: changed post title → previewHash mismatch → post NOT deleted', async () => {
    const t = convexTest(schema, modules)
    const { postId } = await seedPost(t, 'Original Title')

    // Preview with original title
    const { token } = await t.mutation(internal.expAtomicExecute.preview, { postId })

    // Mutate the post title between preview and execute
    await t.run(async (ctx) => {
      await ctx.db.patch(postId, { title: 'Changed Title' })
    })

    // Execute should fail — previewHash mismatch (drift detected)
    await expect(t.mutation(internal.expAtomicExecute.execute, { token, postId })).rejects.toThrow(
      'Preview hash mismatch',
    )

    // Post should still exist
    const post = await t.run(async (ctx) => {
      return await ctx.db.get(postId)
    })
    expect(post).not.toBeNull()
    expect(post!.title).toBe('Changed Title')
  })

  it('args tampered: different postId than preview → argsHash mismatch', async () => {
    const t = convexTest(schema, modules)
    const { postId: postId1 } = await seedPost(t, 'Post One')
    const { postId: postId2 } = await seedPost(t, 'Post Two')

    // Preview for post1
    const { token } = await t.mutation(internal.expAtomicExecute.preview, { postId: postId1 })

    // Execute with post2's id — argsHash won't match
    await expect(
      t.mutation(internal.expAtomicExecute.execute, { token, postId: postId2 }),
    ).rejects.toThrow('Args hash mismatch')

    // Both posts should still exist
    const post1 = await t.run(async (ctx) => await ctx.db.get(postId1))
    const post2 = await t.run(async (ctx) => await ctx.db.get(postId2))
    expect(post1).not.toBeNull()
    expect(post2).not.toBeNull()
  })

  it('expired token: verification fails', async () => {
    const t = convexTest(schema, modules)
    const { postId } = await seedPost(t)

    // Mint an already-expired token
    const { token: expiredToken } = await t.mutation(internal.expAtomicExecute.mintExpiredToken, {
      postId,
    })

    // Execute should fail at JWT verification (step 1)
    await expect(
      t.mutation(internal.expAtomicExecute.execute, { token: expiredToken, postId }),
    ).rejects.toThrow()

    // Post should still exist
    const post = await t.run(async (ctx) => await ctx.db.get(postId))
    expect(post).not.toBeNull()
  })
})

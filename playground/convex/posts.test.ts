/**
 * BDD Integration Tests for Posts CRUD
 *
 * Tests full permission flows with convex-test.
 */

import { describe, it, expect } from 'vitest'

import { api } from './_generated/api'
import { setupTestWithMultipleUsers, setupTestWithTwoOrgs } from './test.helpers'

describe('posts', () => {
  // ==========================================
  // Create
  // ==========================================

  describe('create', () => {
    it('allows members to create posts', async () => {
      const { asMember } = await setupTestWithMultipleUsers()

      const postId = await asMember.mutation(api.posts.create, {
        title: 'Test Post',
        content: 'Content here',
      })

      expect(postId).toBeDefined()
    })

    it('allows admins to create posts', async () => {
      const { asAdmin } = await setupTestWithMultipleUsers()

      const postId = await asAdmin.mutation(api.posts.create, {
        title: 'Admin Post',
        content: 'Content',
      })

      expect(postId).toBeDefined()
    })

    it('denies viewers from creating posts', async () => {
      const { asViewer } = await setupTestWithMultipleUsers()

      await expect(
        asViewer.mutation(api.posts.create, {
          title: 'Test Post',
          content: 'Content here',
        }),
      ).rejects.toThrow('Forbidden: post.create')
    })

    it('denies unauthenticated users', async () => {
      const { t } = await setupTestWithMultipleUsers()

      await expect(
        t.mutation(api.posts.create, {
          title: 'Test',
          content: 'Content',
        }),
      ).rejects.toThrow('Unauthorized')
    })
  })

  // ==========================================
  // List
  // ==========================================

  describe('list', () => {
    it('returns posts in users org only', async () => {
      const { asUser1, asUser2, t, org1Id, org2Id } = await setupTestWithTwoOrgs()

      // User 1 creates a post
      const post1Id = await asUser1.mutation(api.posts.create, {
        title: 'Org 1 Post',
        content: 'Content',
      })

      // User 2 creates a post
      const post2Id = await asUser2.mutation(api.posts.create, {
        title: 'Org 2 Post',
        content: 'Content',
      })

      // User 1 should only see their org's post
      const user1Posts = await asUser1.query(api.posts.list, {})
      expect(user1Posts.length).toBe(1)
      expect(user1Posts[0]._id).toBe(post1Id)

      // User 2 should only see their org's post
      const user2Posts = await asUser2.query(api.posts.list, {})
      expect(user2Posts.length).toBe(1)
      expect(user2Posts[0]._id).toBe(post2Id)
    })

    it('returns empty array for unauthenticated users', async () => {
      const { t, asMember } = await setupTestWithMultipleUsers()

      // Create a post
      await asMember.mutation(api.posts.create, {
        title: 'Test',
        content: 'Content',
      })

      // Unauthenticated user sees nothing
      const posts = await t.query(api.posts.list, {})
      expect(posts).toEqual([])
    })
  })

  // ==========================================
  // Get
  // ==========================================

  describe('get', () => {
    it('returns post if in same org', async () => {
      const { asMember, asAdmin } = await setupTestWithMultipleUsers()

      const postId = await asMember.mutation(api.posts.create, {
        title: 'Test',
        content: 'Content',
      })

      // Admin in same org can get it
      const post = await asAdmin.query(api.posts.get, { id: postId })
      expect(post).not.toBeNull()
      expect(post?.title).toBe('Test')
    })

    it('returns null for posts in different org', async () => {
      const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

      // User 1 creates a post
      const postId = await asUser1.mutation(api.posts.create, {
        title: 'Org 1 Post',
        content: 'Content',
      })

      // User 2 cannot see it
      const post = await asUser2.query(api.posts.get, { id: postId })
      expect(post).toBeNull()
    })
  })

  // ==========================================
  // Update
  // ==========================================

  describe('update', () => {
    it('allows members to update own posts', async () => {
      const { asMember, t } = await setupTestWithMultipleUsers()

      const postId = await asMember.mutation(api.posts.create, {
        title: 'Original',
        content: 'Content',
      })

      await asMember.mutation(api.posts.update, {
        id: postId,
        title: 'Updated',
      })

      const post = await asMember.query(api.posts.get, { id: postId })
      expect(post?.title).toBe('Updated')
    })

    it('denies members from updating others posts', async () => {
      const { asMember, asAdmin } = await setupTestWithMultipleUsers()

      // Admin creates post
      const postId = await asAdmin.mutation(api.posts.create, {
        title: 'Admin Post',
        content: 'Content',
      })

      // Member tries to update
      await expect(
        asMember.mutation(api.posts.update, {
          id: postId,
          title: 'Hacked!',
        }),
      ).rejects.toThrow('Forbidden: post.update')
    })

    it('allows admins to update any post', async () => {
      const { asMember, asAdmin } = await setupTestWithMultipleUsers()

      const postId = await asMember.mutation(api.posts.create, {
        title: 'Member Post',
        content: 'Content',
      })

      await asAdmin.mutation(api.posts.update, {
        id: postId,
        title: 'Admin Updated This',
      })

      const post = await asAdmin.query(api.posts.get, { id: postId })
      expect(post?.title).toBe('Admin Updated This')
    })

    it('denies access to posts in different org', async () => {
      const { asUser1, asUser2 } = await setupTestWithTwoOrgs()

      const postId = await asUser1.mutation(api.posts.create, {
        title: 'Org 1 Post',
        content: 'Content',
      })

      await expect(
        asUser2.mutation(api.posts.update, {
          id: postId,
          title: 'Trying to update',
        }),
      ).rejects.toThrow('Forbidden: post.update')
    })
  })

  // ==========================================
  // Delete
  // ==========================================

  describe('delete', () => {
    it('allows members to delete own posts', async () => {
      const { asMember } = await setupTestWithMultipleUsers()

      const postId = await asMember.mutation(api.posts.create, {
        title: 'To Delete',
        content: 'Content',
      })

      await asMember.mutation(api.posts.remove, { id: postId })

      const post = await asMember.query(api.posts.get, { id: postId })
      expect(post).toBeNull()
    })

    it('denies members from deleting others posts', async () => {
      const { asMember, asOwner } = await setupTestWithMultipleUsers()

      const postId = await asOwner.mutation(api.posts.create, {
        title: 'Owner Post',
        content: 'Content',
      })

      await expect(asMember.mutation(api.posts.remove, { id: postId })).rejects.toThrow(
        'Forbidden: post.delete',
      )
    })

    it('allows owners to delete any post', async () => {
      const { asMember, asOwner } = await setupTestWithMultipleUsers()

      const postId = await asMember.mutation(api.posts.create, {
        title: 'Member Post',
        content: 'Content',
      })

      await asOwner.mutation(api.posts.remove, { id: postId })

      const post = await asOwner.query(api.posts.get, { id: postId })
      expect(post).toBeNull()
    })
  })

  // ==========================================
  // Publish
  // ==========================================

  describe('publish', () => {
    it('allows admins to publish', async () => {
      const { asAdmin } = await setupTestWithMultipleUsers()

      const postId = await asAdmin.mutation(api.posts.create, {
        title: 'Post',
        content: 'Content',
      })

      await asAdmin.mutation(api.posts.publish, { id: postId })

      const post = await asAdmin.query(api.posts.get, { id: postId })
      expect(post?.status).toBe('published')
    })

    it('allows owners to publish', async () => {
      const { asOwner } = await setupTestWithMultipleUsers()

      const postId = await asOwner.mutation(api.posts.create, {
        title: 'Post',
        content: 'Content',
      })

      await asOwner.mutation(api.posts.publish, { id: postId })

      const post = await asOwner.query(api.posts.get, { id: postId })
      expect(post?.status).toBe('published')
    })

    it('denies members from publishing even their own posts', async () => {
      const { asMember } = await setupTestWithMultipleUsers()

      const postId = await asMember.mutation(api.posts.create, {
        title: 'My Post',
        content: 'Content',
      })

      await expect(asMember.mutation(api.posts.publish, { id: postId })).rejects.toThrow(
        'Forbidden: post.publish',
      )
    })

    it('denies viewers from publishing', async () => {
      const { asViewer, asAdmin } = await setupTestWithMultipleUsers()

      const postId = await asAdmin.mutation(api.posts.create, {
        title: 'Post',
        content: 'Content',
      })

      await expect(asViewer.mutation(api.posts.publish, { id: postId })).rejects.toThrow(
        'Forbidden: post.publish',
      )
    })
  })
})

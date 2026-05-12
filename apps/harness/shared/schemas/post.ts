import { v } from 'convex/values'

import { defineOperationDescriptor } from '../../../../src/runtime/functions/define-operation'
import { operationPreviewValidator } from '../../../../src/runtime/functions/operation-preview'
import { defineArgs } from '../../../../src/runtime/schema'

export const createPost = defineArgs({
  description: 'Create a new blog post',
  args: {
    title: v.string(),
    content: v.string(),
  },
  meta: {
    title: { label: 'Title', description: 'The post title' },
    content: { label: 'Content', description: 'Post body in markdown' },
  },
})

export const updatePost = defineArgs({
  description: 'Update an existing blog post',
  args: {
    id: v.id('posts'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  meta: {
    id: { label: 'Post ID', description: 'The post to update' },
    title: { label: 'Title', description: 'New title (optional)' },
    content: { label: 'Content', description: 'New content (optional)' },
  },
})

export const deletePost = defineArgs({
  description: 'Permanently delete a post',
  args: {
    id: v.id('posts'),
  },
  meta: {
    id: { label: 'Post ID', description: 'The post to delete' },
  },
})

export const removePostDescriptor = defineOperationDescriptor({
  id: 'posts.remove',
  name: 'removePost',
  kind: 'destructive',
  args: deletePost.args,
  permission: 'post.delete',
  safety: 'destructive-write',
  returns: v.null(),
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      operation: v.literal('posts.remove'),
      targetId: v.id('posts'),
      affectedCounts: v.object({
        posts: v.number(),
      }),
    }),
  }),
})

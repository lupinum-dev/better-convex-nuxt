import { v } from 'convex/values'

import {
  defineSchema,
  defineTableMeta,
} from '../../../src/runtime/schema'

export const createComment = defineSchema({
  description: 'Add a comment to a post',
  args: {
    postId: v.id('posts'),
    content: v.string(),
  },
  meta: {
    postId: { label: 'Post', description: 'The post to comment on' },
    content: { label: 'Comment', description: 'The comment text' },
  },
})

export const updateComment = defineSchema({
  description: 'Edit an existing comment',
  args: {
    id: v.id('comments'),
    content: v.string(),
  },
  meta: {
    id: { label: 'Comment ID', description: 'The comment to update' },
    content: { label: 'Comment', description: 'New comment text' },
  },
})

export const deleteComment = defineSchema({
  description: 'Delete a comment',
  args: {
    id: v.id('comments'),
  },
  meta: {
    id: { label: 'Comment ID', description: 'The comment to delete' },
  },
})

export const listCommentsByPost = defineSchema({
  description: 'List all comments on a post',
  args: {
    postId: v.id('posts'),
  },
  meta: {
    postId: { label: 'Post', description: 'The post to list comments for' },
  },
})

export const commentTable = defineTableMeta({
  description: 'Comments on blog posts',
  tenant: { scoped: true, ownerField: 'ownerId' },
})

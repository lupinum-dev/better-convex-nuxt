import { v } from 'convex/values'

import { defineArgs } from '../../../../src/runtime/schema'

export const createComment = defineArgs({
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

export const updateComment = defineArgs({
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

export const deleteComment = defineArgs({
  description: 'Delete a comment',
  args: {
    id: v.id('comments'),
  },
  meta: {
    id: { label: 'Comment ID', description: 'The comment to delete' },
  },
})

export const listCommentsByPost = defineArgs({
  description: 'List all comments on a post',
  args: {
    postId: v.id('posts'),
  },
  meta: {
    postId: { label: 'Post', description: 'The post to list comments for' },
  },
})

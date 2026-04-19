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

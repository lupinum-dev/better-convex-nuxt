import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createComment = defineArgs({
  description: 'Comment on a task, optionally attaching one uploaded file.',
  args: {
    taskId: v.id('tasks'),
    body: v.string(),
    attachmentStorageId: v.optional(v.id('_storage')),
  },
})

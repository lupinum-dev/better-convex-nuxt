/**
 * Why this file exists:
 * Comments demonstrate uploads plus nested authorization, so the input shape gets reused in
 * handlers, task-detail UI, and tests.
 */
import { v } from 'convex/values'

import { defineArgs } from 'better-convex-nuxt/schema'

export const createComment = defineArgs({
  description: 'Comment on a task, optionally attaching one uploaded file.',
  args: {
    taskId: v.id('tasks'),
    body: v.string(),
    attachmentStorageId: v.optional(v.id('_storage')),
  },
})

import { v } from 'convex/values'

import { defineArgs } from '../../../../src/runtime/schema'

export const addTask = defineArgs({
  description: 'Add a task to your personal list',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'The task title',
      examples: ['Review MCP verification flow', 'Ship internal harness smoke tests'],
    },
  },
})

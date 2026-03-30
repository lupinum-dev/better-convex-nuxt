import { v } from 'convex/values'

import { defineSchema } from '../../../src/runtime/schema'

export const addTask = defineSchema({
  description: 'Add a task to your personal list',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'The task title',
      examples: [
        'Review MCP verification flow',
        'Ship playground smoke tests',
      ],
    },
  },
})

export const listTasks = defineSchema({
  description: 'List your tasks',
  args: {},
})

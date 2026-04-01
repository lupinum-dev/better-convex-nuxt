import { v } from 'convex/values'

import { defineArgs } from '../../../../src/runtime/args'

export const createTask = defineArgs({
  description: 'Create a task',
  args: {
    title: v.string(),
  },
  meta: {
    title: { description: 'Task title' },
  },
})

export const createTaskArgs = createTask.args
export const createTaskMeta = createTask.meta

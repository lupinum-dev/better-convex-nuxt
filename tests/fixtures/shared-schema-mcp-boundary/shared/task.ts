import { v } from 'convex/values'

import { defineArgs } from '../../../../src/runtime/args'

export const createTask = defineArgs({
  description: 'Create a task',
  args: {
    title: v.string(),
    projectId: v.optional(v.id('projects')),
    tagIds: v.optional(v.array(v.id('tags'))),
    visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
  },
  meta: {
    title: { description: 'Task title' },
    projectId: { description: 'Optional project scope for the task.' },
  },
})

export const createTaskArgs = createTask.args
export const createTaskMeta = createTask.meta

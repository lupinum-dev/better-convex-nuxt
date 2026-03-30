import { defineSchema } from 'better-convex-nuxt/schema'
import { v } from 'convex/values'

export const createTask = defineSchema({
  description: 'Create a task',
  args: {
    title: v.string(),
  },
  meta: {
    title: { description: 'Task title' },
  },
})

export const createTaskArgs = createTask.validators
export const createTaskMeta = createTask.meta

import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const taskStatusValidator = v.union(
  v.literal('backlog'),
  v.literal('in_progress'),
  v.literal('done'),
)

export const taskPriorityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
)

export const createTask = defineArgs({
  description: 'Create a task inside a project.',
  args: {
    projectId: v.id('projects'),
    title: v.string(),
    priority: v.optional(taskPriorityValidator),
  },
  meta: {
    title: {
      label: 'Task title',
      examples: ['Review billing PR', 'Reply to customer notes'],
    },
  },
})

export const moveTask = defineArgs({
  description: 'Move a task between board columns.',
  args: {
    id: v.id('tasks'),
    status: taskStatusValidator,
  },
})

export const assignTask = defineArgs({
  description: 'Assign a task to another workspace member.',
  args: {
    id: v.id('tasks'),
    assigneeId: v.optional(v.id('users')),
  },
})

export const createTaskFromWebhook = defineArgs({
  description: 'Create a task from a verified webhook route.',
  args: {
    projectId: v.id('projects'),
    title: v.string(),
    priority: v.optional(taskPriorityValidator),
  },
})

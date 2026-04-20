import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const projectStatusValidator = v.union(v.literal('active'), v.literal('archived'))

export const createProject = defineArgs({
  description: 'Create a new project inside the current workspace.',
  args: {
    name: v.string(),
    summary: v.optional(v.string()),
  },
})

export const archiveProject = defineArgs({
  description: 'Archive a project and freeze new task creation.',
  args: {
    id: v.id('projects'),
  },
})

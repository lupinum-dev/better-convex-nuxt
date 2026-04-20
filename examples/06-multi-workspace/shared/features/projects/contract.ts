import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const listProjects = defineArgs({
  description: 'List projects in the current workspace.',
  args: {},
})

export const createProject = defineArgs({
  description: 'Create a project in the current workspace.',
  args: {
    name: v.string(),
  },
})

export const toggleProjectStatus = defineArgs({
  description: 'Toggle a project between active and paused.',
  args: {
    id: v.id('projects'),
  },
})

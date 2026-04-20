import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createWorkspace = defineArgs({
  description: 'Create a new workspace for the signed-in user.',
  args: {
    name: v.string(),
    slug: v.string(),
  },
})

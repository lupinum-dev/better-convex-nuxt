import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createTodo = defineArgs({
  description: 'Create a personal todo',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'A short description of something only this signed-in user should see',
      examples: ['Renew passport', 'Review onboarding copy'],
    },
  },
})

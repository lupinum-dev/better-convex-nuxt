import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createTodo = defineArgs({
  description: 'Create a public todo item',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'The todo text shown in the list',
      examples: ['Buy oat milk', 'Ship the first public demo'],
    },
  },
})

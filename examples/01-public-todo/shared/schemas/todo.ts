import { defineArgs } from '@lupinum/trellis/args'
/**
 * Why this file exists:
 * This args definition lives in `shared/` because both Convex code and Nuxt server code can import it.
 * Keeping it runtime-neutral makes it safe to reuse across those two build targets.
 */
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

import { defineArgs } from '@lupinum/trellis/args'
/**
 * Why this file exists:
 * This runtime-neutral contract lives in `shared/` because both Convex code and Nuxt server code can import it.
 * Keep browser/Nitro-only Zod edge validation in this folder too, but avoid adding runtime-specific code here.
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

/**
 * Why this file exists:
 * V2 schemas are defined once, then reused by handlers, forms, and MCP tools.
 * This example only uses the schema in Convex functions, but the shape is the same everywhere.
 */
import { v } from 'convex/values'

import { defineSchema } from 'better-convex-nuxt/schema'

export const createTodo = defineSchema({
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

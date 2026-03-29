import type { ConvexSchemaMetaFor } from 'better-convex-nuxt/schema'
import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

export const addTaskArgs = {
  title: v.string(),
} satisfies PropertyValidators

export const addTaskMeta = {
  description: 'Add a task to your personal list',
  fields: {
    title: {
      label: 'Title',
      description: 'The task title',
      examples: ['Review MCP verification flow', 'Ship playground smoke tests'],
    },
  },
} satisfies ConvexSchemaMetaFor<typeof addTaskArgs>

export const listTasksMeta = {
  description: 'List your tasks',
} satisfies ConvexSchemaMetaFor<{}>

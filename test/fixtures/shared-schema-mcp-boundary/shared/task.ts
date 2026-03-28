import type { ConvexSchemaMetaFor } from 'better-convex-nuxt/schema'
import { v } from 'convex/values'

export const createTaskArgs = {
  title: v.string(),
}

export const createTaskMeta = {
  description: 'Create a task',
  fields: {
    title: { description: 'Task title' },
  },
} satisfies ConvexSchemaMetaFor<typeof createTaskArgs>

import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { defineEventHandler } from 'h3'

import { createTaskArgs, createTaskMeta } from '../../shared/task'

const schema = defineConvexSchema(createTaskArgs, createTaskMeta)

export default defineEventHandler(() => {
  return schema.validate({ title: 'Server-safe schema import works' })
})

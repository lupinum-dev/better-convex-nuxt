import { can } from 'better-convex-nuxt/auth'
import { defineCapabilities } from 'better-convex-nuxt/visibility'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'
import { canAssignTask, canDeleteTask, canUpdateTask } from './checks'

export const taskCapabilities = defineCapabilities<Doc<'tasks'>>()({
  update: (actor, task) => can(actor, canUpdateTask(task)),
  delete: (actor, task) => can(actor, canDeleteTask(task)),
  assign: (actor) => can(actor, canAssignTask),
})

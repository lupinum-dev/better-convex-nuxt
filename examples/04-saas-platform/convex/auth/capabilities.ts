import { can } from '@lupinum/trellis/auth'
import { defineCapabilities } from '@lupinum/trellis/visibility'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'
import { canAssignTask, canDeleteTask, canUpdateTask } from './checks'

export const taskCapabilities = defineCapabilities<Doc<'tasks'>>()({
  update: (actor, task) => can(actor, canUpdateTask(task)),
  delete: (actor, task) => can(actor, canDeleteTask(task)),
  assign: (actor) => can(actor, canAssignTask),
})

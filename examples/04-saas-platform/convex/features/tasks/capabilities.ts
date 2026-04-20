import { can } from '@lupinum/trellis/auth'
import { defineCapabilities } from '@lupinum/trellis/visibility'

import type { Doc } from '../../_generated/dataModel'
import type { Actor } from '../../auth/actor'
import { canDeleteTask, canUpdateTask } from './checks'
import { taskAssign } from './permissions'

export const taskCapabilities = defineCapabilities<Doc<'tasks'>>()({
  update: (actor: Actor, task) => can(actor, canUpdateTask(task)),
  delete: (actor: Actor, task) => can(actor, canDeleteTask(task)),
  assign: (actor: Actor) => can(actor, taskAssign.check),
})

import { can } from '@lupinum/trellis/auth'
import { defineRecordAccess } from '@lupinum/trellis/workspace'

import type { Doc } from '../../_generated/dataModel'
import type { AppIdentity } from '../../auth/appIdentity'
import { canDeleteTask, canUpdateTask } from './checks'
import { taskAssign } from './permissions'

export const taskCapabilities = defineRecordAccess<Doc<'tasks'>>()({
  update: (appIdentity: AppIdentity, task) => can(appIdentity, canUpdateTask(task)),
  delete: (appIdentity: AppIdentity, task) => can(appIdentity, canDeleteTask(task)),
  assign: (appIdentity: AppIdentity) => can(appIdentity, taskAssign.check),
})

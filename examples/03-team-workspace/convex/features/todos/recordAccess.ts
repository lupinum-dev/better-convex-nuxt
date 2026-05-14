import { can } from '@lupinum/trellis/auth'
import { defineRecordAccess } from '@lupinum/trellis/workspace'

import type { Doc } from '../../_generated/dataModel'
import type { AppIdentity } from '../../auth/appIdentity'
import { canDeleteTodo, canUpdateTodo } from './checks'

export const todoCapabilities = defineRecordAccess<Doc<'todos'>>()({
  update: (appIdentity: AppIdentity, todo) => can(appIdentity, canUpdateTodo(todo)),
  delete: (appIdentity: AppIdentity, todo) => can(appIdentity, canDeleteTodo(todo)),
})

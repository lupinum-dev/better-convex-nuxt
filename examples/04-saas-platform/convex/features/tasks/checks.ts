import { and, or } from '@lupinum/trellis/auth'

import type { Doc } from '../../_generated/dataModel'
import { hasRole, hasWorkspace, isOwnerOf } from '../../auth/guards'

export const canUpdateTask = (task: Doc<'tasks'>) =>
  hasWorkspace.and(or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task))))

export const canDeleteTask = (task: Doc<'tasks'>) =>
  hasWorkspace.and(or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task))))

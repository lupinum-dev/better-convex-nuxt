import { can } from '@lupinum/trellis/auth'
import { defineRecordAccess } from '@lupinum/trellis/workspace'

import type { Doc } from '../../_generated/dataModel'
import type { AppIdentity } from '../../auth/appIdentity'
import { canDeleteRunbook, canUpdateRunbook } from './checks'
import { runbookPublish } from './permissions'

type PublicRunbook = {
  _id: string
  title: string
  summary: string
  content: string
  tags: string[]
  visibility: 'public' | 'workspace' | 'draft'
  publishedAt: number | null
  ownerId: string
}

export const workspaceRunbookCapabilities = defineRecordAccess<Doc<'runbooks'>>()({
  update: (appIdentity: AppIdentity, runbook) => can(appIdentity, canUpdateRunbook(runbook)),
  delete: (appIdentity: AppIdentity, runbook) => can(appIdentity, canDeleteRunbook(runbook)),
  publish: (appIdentity: AppIdentity) => can(appIdentity, runbookPublish.check),
})

export const publicRunbookCapabilities = defineRecordAccess<PublicRunbook>()({
  update: (appIdentity: AppIdentity | null, runbook) =>
    !!appIdentity && can(appIdentity, canUpdateRunbook({ ownerId: runbook.ownerId })),
  delete: (appIdentity: AppIdentity | null, runbook) =>
    !!appIdentity && can(appIdentity, canDeleteRunbook({ ownerId: runbook.ownerId })),
  publish: (appIdentity: AppIdentity | null) =>
    !!appIdentity && can(appIdentity, runbookPublish.check),
})

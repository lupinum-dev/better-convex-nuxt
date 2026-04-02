import { can } from '@lupinum/trellis/auth'
import { defineCapabilities } from '@lupinum/trellis/visibility'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'
import { canDeleteRunbook, canPublishRunbook, canUpdateRunbook } from './checks'

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

export const workspaceRunbookCapabilities = defineCapabilities<Doc<'runbooks'>>()({
  update: (actor, runbook) => can(actor, canUpdateRunbook(runbook)),
  delete: (actor, runbook) => can(actor, canDeleteRunbook(runbook)),
  publish: (actor) => can(actor, canPublishRunbook),
})

export const publicRunbookCapabilities = defineCapabilities<PublicRunbook>()({
  update: (actor, runbook) => !!actor && can(actor, canUpdateRunbook({ ownerId: runbook.ownerId })),
  delete: (actor, runbook) => !!actor && can(actor, canDeleteRunbook({ ownerId: runbook.ownerId })),
  publish: (actor) => !!actor && can(actor, canPublishRunbook),
})

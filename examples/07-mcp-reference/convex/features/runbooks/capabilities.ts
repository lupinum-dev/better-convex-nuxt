import { can } from '@lupinum/trellis/auth'
import { defineCapabilities } from '@lupinum/trellis/workspace'

import type { Doc } from '../../_generated/dataModel'
import type { Actor } from '../../auth/actor'
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

export const workspaceRunbookCapabilities = defineCapabilities<Doc<'runbooks'>>()({
  update: (actor: Actor, runbook) => can(actor, canUpdateRunbook(runbook)),
  delete: (actor: Actor, runbook) => can(actor, canDeleteRunbook(runbook)),
  publish: (actor: Actor) => can(actor, runbookPublish.check),
})

export const publicRunbookCapabilities = defineCapabilities<PublicRunbook>()({
  update: (actor: Actor | null, runbook) =>
    !!actor && can(actor, canUpdateRunbook({ ownerId: runbook.ownerId })),
  delete: (actor: Actor | null, runbook) =>
    !!actor && can(actor, canDeleteRunbook({ ownerId: runbook.ownerId })),
  publish: (actor: Actor | null) => !!actor && can(actor, runbookPublish.check),
})

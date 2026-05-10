import { can } from '@lupinum/trellis/auth'
import { implementOperation, previewOf } from '@lupinum/trellis/backend'

import {
  bulkRemoveRunbooksDescriptor,
  removeRunbookDescriptor,
} from '../../../shared/features/runbooks/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import type { Actor } from '../../auth/actor'
import { query } from '../../functions'
import { canDeleteRunbook } from './checks'
import { runbookBulkDelete, runbookRead } from './permissions'

type RunbookMutationCtx = any

type DeleteRunbookArgs = {
  id: Id<'runbooks'>
}

type BulkDeleteRunbooksArgs = {
  ids: Id<'runbooks'>[]
}

type LoadedRunbook = {
  runbook: Doc<'runbooks'>
}

type LoadedBulkRunbooks = {
  found: Doc<'runbooks'>[]
}

export const removeRunbookOp = implementOperation(removeRunbookDescriptor, {
  guard: runbookRead,
  load: async (ctx: RunbookMutationCtx, args: DeleteRunbookArgs): Promise<LoadedRunbook> => {
    const runbook = await ctx.db.get(args.id)
    if (!runbook) throw new Error('Runbook not found.')
    const actor = await ctx.actor()
    if (!actor || !can(actor, canDeleteRunbook(runbook))) {
      throw new Error('Forbidden: Delete runbook')
    }
    return { runbook }
  },
  preview: async (
    _ctx: RunbookMutationCtx,
    _args: DeleteRunbookArgs,
    { runbook }: LoadedRunbook,
  ) => ({
    display: {
      summary: `Will permanently delete "${runbook.title}".`,
      warn: 'This cannot be undone.',
      affects: { runbooks: 1 },
    },
    confirm: {
      operation: 'runbooks.remove',
      targetId: runbook._id,
      affectedCounts: { runbooks: 1 },
    },
  }),
  handler: async (ctx: RunbookMutationCtx, args: DeleteRunbookArgs) => {
    await ctx.db.delete(args.id)
    return null
  },
})

export const bulkRemoveRunbooksOp = implementOperation(bulkRemoveRunbooksDescriptor, {
  guard: runbookBulkDelete,
  load: async (
    ctx: RunbookMutationCtx,
    args: BulkDeleteRunbooksArgs,
  ): Promise<LoadedBulkRunbooks> => {
    const actor = await ctx.actor()
    const runbooks = await Promise.all(args.ids.map((id: Id<'runbooks'>) => ctx.db.get(id)))
    const found = runbooks.filter(
      (runbook): runbook is NonNullable<(typeof runbooks)[number]> =>
        !!runbook &&
        runbook.workspaceId === actor.tenantId &&
        can(actor, canDeleteRunbook(runbook)),
    )

    return { found }
  },
  preview: async (
    _ctx: RunbookMutationCtx,
    args: BulkDeleteRunbooksArgs,
    { found }: LoadedBulkRunbooks,
  ) => {
    if (found.length === 0) {
      return {
        display: {
          summary: 'None of the selected runbooks can be deleted.',
          blocked: true,
        },
        confirm: {
          operation: 'runbooks.bulkRemove',
          targetIds: [],
          affectedCounts: { runbooks: 0 },
        },
      }
    }

    return {
      display: {
        summary: `Will delete ${found.length} runbook${found.length === 1 ? '' : 's'}: ${found.map((runbook: Doc<'runbooks'>) => `"${runbook.title}"`).join(', ')}`,
        warn:
          found.length !== args.ids.length
            ? 'Some ids were missing and will be skipped.'
            : undefined,
        affects: { runbooks: found.length },
      },
      confirm: {
        operation: 'runbooks.bulkRemove',
        targetIds: found.map((runbook: Doc<'runbooks'>) => runbook._id).sort(),
        affectedCounts: { runbooks: found.length },
      },
    }
  },
  handler: async (ctx: RunbookMutationCtx, args: BulkDeleteRunbooksArgs) => {
    const actor = await ctx.actor()

    let deleted = 0
    const skipped: { id: string; reason: string }[] = []

    for (const id of args.ids as Id<'runbooks'>[]) {
      const runbook = await ctx.db.get(id)
      if (!runbook) {
        skipped.push({ id, reason: 'not_found' })
        continue
      }
      if (runbook.workspaceId !== actor.tenantId) {
        skipped.push({ id, reason: 'different_workspace' })
        continue
      }
      if (!can(actor, canDeleteRunbook(runbook))) {
        skipped.push({ id, reason: 'forbidden' })
        continue
      }

      await ctx.db.delete(id)
      deleted++
    }

    return {
      deleted,
      skipped,
      total: args.ids.length,
    }
  },
})

export const previewRemove = query.protected(previewOf(removeRunbookOp))
export const previewBulkRemove = query.protected(previewOf(bulkRemoveRunbooksOp))

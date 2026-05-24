import { can } from '@lupinum/trellis/auth'
import {
  blockedOperationPreview,
  implementOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  previewOf,
} from '@lupinum/trellis/backend'

import {
  bulkRemoveRunbooksDescriptor,
  removeRunbookDescriptor,
} from '../../../shared/features/runbooks/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import type { AppIdentity } from '../../auth/appIdentity'
import { mutation } from '../../functions'
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
  identityForwardingFunctionRef: 'features/runbooks/domain:remove',
  guard: runbookRead,
  load: async (ctx: RunbookMutationCtx, args: DeleteRunbookArgs): Promise<LoadedRunbook> => {
    const runbook = await ctx.db.get(args.id)
    if (!runbook) throw new Error('Runbook not found.')
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity || !can(appIdentity, canDeleteRunbook(runbook))) {
      throw new Error('Forbidden: Delete runbook')
    }
    return { runbook }
  },
  preview: async (_ctx: RunbookMutationCtx, _args: DeleteRunbookArgs, { runbook }: LoadedRunbook) =>
    operationPreview({
      summary: `Will permanently delete "${runbook.title}".`,
      warnings: [operationIssue({ code: 'permanent-delete', message: 'This cannot be undone.' })],
      effects: [operationEffect({ kind: 'runbooks', summary: 'Runbooks deleted', count: 1 })],
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
  identityForwardingFunctionRef: 'features/runbooks/domain:bulkRemove',
  guard: runbookBulkDelete,
  load: async (
    ctx: RunbookMutationCtx,
    args: BulkDeleteRunbooksArgs,
  ): Promise<LoadedBulkRunbooks> => {
    const appIdentity = await ctx.appIdentity()
    const runbooks = await Promise.all(args.ids.map((id: Id<'runbooks'>) => ctx.db.get(id)))
    const found = runbooks.filter(
      (runbook): runbook is NonNullable<(typeof runbooks)[number]> =>
        !!runbook &&
        runbook.workspaceId === appIdentity.workspaceId &&
        can(appIdentity, canDeleteRunbook(runbook)),
    )

    return { found }
  },
  preview: async (
    _ctx: RunbookMutationCtx,
    args: BulkDeleteRunbooksArgs,
    { found }: LoadedBulkRunbooks,
  ) => {
    if (found.length === 0) {
      return blockedOperationPreview({
        summary: 'None of the selected runbooks can be deleted.',
        blockers: [
          operationIssue({
            code: 'no-deletable-runbooks',
            message: 'None of the selected runbooks can be deleted.',
          }),
        ],
        confirm: {
          operation: 'runbooks.bulkRemove',
          targetIds: [],
          affectedCounts: { runbooks: 0 },
        },
      })
    }

    return operationPreview({
      summary: `Will delete ${found.length} runbook${found.length === 1 ? '' : 's'}: ${found.map((runbook: Doc<'runbooks'>) => `"${runbook.title}"`).join(', ')}`,
      warnings:
        found.length !== args.ids.length
          ? [
              operationIssue({
                code: 'some-runbooks-skipped',
                message: 'Some ids were missing and will be skipped.',
              }),
            ]
          : [],
      effects: [
        operationEffect({ kind: 'runbooks', summary: 'Runbooks deleted', count: found.length }),
      ],
      confirm: {
        operation: 'runbooks.bulkRemove',
        targetIds: found.map((runbook: Doc<'runbooks'>) => runbook._id).sort(),
        affectedCounts: { runbooks: found.length },
      },
    })
  },
  handler: async (ctx: RunbookMutationCtx, args: BulkDeleteRunbooksArgs) => {
    const appIdentity = await ctx.appIdentity()

    let deleted = 0
    const skipped: { id: string; reason: string }[] = []

    for (const id of args.ids as Id<'runbooks'>[]) {
      const runbook = await ctx.db.get(id)
      if (!runbook) {
        skipped.push({ id, reason: 'not_found' })
        continue
      }
      if (runbook.workspaceId !== appIdentity.workspaceId) {
        skipped.push({ id, reason: 'different_workspace' })
        continue
      }
      if (!can(appIdentity, canDeleteRunbook(runbook))) {
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

export const previewRemove = mutation.protected({
  ...previewOf(removeRunbookOp),
  identityForwardingFunctionRef: 'features/runbooks/operations:previewRemove',
})
export const previewBulkRemove = mutation.protected({
  ...previewOf(bulkRemoveRunbooksOp),
  identityForwardingFunctionRef: 'features/runbooks/operations:previewBulkRemove',
})

import { can } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { bulkDeleteRunbooks, deleteRunbook } from '../../../shared/features/runbooks/contract'
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

export const removeRunbookOp = defineOperation({
  id: 'runbooks.remove',
  name: 'removeRunbook',
  kind: 'destructive',
  args: deleteRunbook.args,
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        runbooks: v.number(),
      }),
    }),
    confirm: v.object({
      operation: v.literal('runbooks.remove'),
      targetId: v.id('runbooks'),
      affectedCounts: v.object({
        runbooks: v.number(),
      }),
    }),
  }),
  guard: runbookRead,
  load: async (ctx: RunbookMutationCtx, args: DeleteRunbookArgs): Promise<LoadedRunbook> => {
    const runbook = await ctx.db.get(args.id)
    if (!runbook) throw new Error('Runbook not found.')
    return { runbook }
  },
  authorize: {
    check: (_actor: Actor, { runbook }: LoadedRunbook) => canDeleteRunbook(runbook),
  } as any,
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

export const bulkRemoveRunbooksOp = defineOperation({
  id: 'runbooks.bulkRemove',
  name: 'bulkRemoveRunbooks',
  kind: 'destructive',
  args: bulkDeleteRunbooks.args,
  returns: v.object({
    deleted: v.number(),
    skipped: v.array(
      v.object({
        id: v.string(),
        reason: v.string(),
      }),
    ),
    total: v.number(),
  }),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.optional(v.string()),
      affects: v.optional(
        v.object({
          runbooks: v.number(),
        }),
      ),
      blocked: v.optional(v.boolean()),
    }),
    confirm: v.object({
      operation: v.literal('runbooks.bulkRemove'),
      targetIds: v.array(v.id('runbooks')),
      affectedCounts: v.object({
        runbooks: v.number(),
      }),
    }),
  }),
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

export const previewRemove = query(previewOf(removeRunbookOp as any) as any)
export const previewBulkRemove = query(previewOf(bulkRemoveRunbooksOp as any) as any)

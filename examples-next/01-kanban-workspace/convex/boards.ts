import { requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { archiveBoardArgs, createCardArgs, moveCardArgs } from '../shared/schemas/kanban'
import type { Doc, Id } from './_generated/dataModel'
import type { Actor } from './auth/actor'
import {
  canArchiveBoard,
  canCreateCards,
  canMoveCards,
  canReadWorkspaceBoard,
} from './auth/checks'
import type { KanbanPrincipal } from './auth/principal'
import { mutation, query } from './functions'

type BoardRecord = Doc<'boards'>
type ColumnRecord = Doc<'columns'>
type CardRecord = Doc<'cards'>

type ArchiveBoardPreview = {
  summary: string
  warn: string
  affects: {
    columns: number
    cards: number
  }
}

type ArchiveBoardLoaded = {
  board: BoardRecord
  columns: ColumnRecord[]
  cards: CardRecord[]
}

async function getCurrentBoardRecord(ctx: any, workspaceId: Id<'workspaces'>) {
  return await ctx.db
    .query('boards')
    .withIndex('by_workspace_archived', (q: any) =>
      q.eq('workspaceId', workspaceId).eq('archived', false),
    )
    .first()
}

async function listBoardColumns(ctx: any, boardId: Id<'boards'>, workspaceId: Id<'workspaces'>) {
  return await ctx.db
    .query('columns')
    .withIndex('by_workspace_board_position', (q: any) =>
      q.eq('workspaceId', workspaceId).eq('boardId', boardId),
    )
    .collect()
}

async function listColumnCards(ctx: any, columnId: Id<'columns'>, workspaceId: Id<'workspaces'>) {
  return await ctx.db
    .query('cards')
    .withIndex('by_workspace_column_position', (q: any) =>
      q.eq('workspaceId', workspaceId).eq('columnId', columnId),
    )
    .collect()
}

export const getCurrentBoard = query({
  guard: canReadWorkspaceBoard,
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const workspaceId = actor?.tenantId
    if (!workspaceId) throw new Error('Current actor is not assigned to a workspace.')

    const workspace = await ctx.db.get(workspaceId)
    requireRecord(workspace, 'Workspace')

    const board = await getCurrentBoardRecord(ctx, workspaceId)
    if (!board) return null
    const columns = await listBoardColumns(ctx, board._id, workspaceId)

    return {
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        slug: workspace.slug,
      },
      actorRole: actor.role,
      board: {
        _id: board._id,
        title: board.title,
      },
      permissions: {
        createCard: ['owner', 'admin', 'member'].includes(actor.role),
        moveCard: ['owner', 'admin', 'member'].includes(actor.role),
        archiveBoard: ['owner', 'admin'].includes(actor.role),
      },
      columns: await Promise.all(
        columns.map(async (column: ColumnRecord) => ({
          _id: column._id,
          title: column.title,
          position: column.position,
          cards: (await listColumnCards(ctx, column._id, workspaceId)).map((card: CardRecord) => ({
            _id: card._id,
            title: card.title,
            position: card.position,
          })),
        })),
      ),
    }
  },
})

export const createCard = mutation({
  guard: canCreateCards,
  args: createCardArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = actor?.tenantId
    if (!workspaceId) throw new Error('Current actor is not assigned to a workspace.')

    const column = await ctx.db.get(args.columnId)
    requireRecord(column, 'Column')

    const existing = await listColumnCards(ctx, column._id, workspaceId)
    const position =
      existing.length === 0 ? 0 : Math.max(...existing.map((card: CardRecord) => card.position)) + 1

    return await ctx.db.insert('cards', {
      workspaceId,
      boardId: column.boardId,
      columnId: column._id,
      title: args.title.trim(),
      position,
      ownerId: actor.userId,
      createdAt: Date.now(),
    })
  },
})

export const moveCard = mutation({
  guard: canMoveCards,
  args: moveCardArgs.args,
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = actor?.tenantId
    if (!workspaceId) throw new Error('Current actor is not assigned to a workspace.')

    const card = await ctx.db.get(args.id)
    requireRecord(card, 'Card')

    const columns = await listBoardColumns(ctx, card.boardId, workspaceId)
    const currentIndex = columns.findIndex((column: ColumnRecord) => column._id === card.columnId)
    if (currentIndex === -1) throw new Error('Card column not found.')

    const nextIndex = args.direction === 'left' ? currentIndex - 1 : currentIndex + 1
    const targetColumn = columns[nextIndex]
    if (!targetColumn) return null

    const targetCards = await listColumnCards(ctx, targetColumn._id, workspaceId)
    const position =
      targetCards.length === 0
        ? 0
        : Math.max(...targetCards.map((target: CardRecord) => target.position)) + 1

    await ctx.db.patch(card._id, {
      columnId: targetColumn._id,
      position,
    })

    return null
  },
})

const archiveBoardOp = defineOperation<
  any,
  KanbanPrincipal,
  Actor,
  typeof canArchiveBoard,
  typeof archiveBoardArgs.args,
  ArchiveBoardLoaded,
  null,
  ArchiveBoardPreview
>({
  name: 'archiveBoard',
  kind: 'destructive',
  args: archiveBoardArgs.args,
  returns: v.null(),
  previewReturns: v.object({
    summary: v.string(),
    warn: v.string(),
    affects: v.object({
      columns: v.number(),
      cards: v.number(),
    }),
  }),
  guard: canArchiveBoard,
  load: async (ctx, args) => {
    const board = await ctx.db.get(args.id)
    requireRecord(board, 'Board')
    const columns = await ctx.db
      .query('columns')
      .withIndex('by_workspace_board_position', (q: any) =>
        q.eq('workspaceId', board.workspaceId).eq('boardId', board._id),
      )
      .collect()

    const cards = await ctx.db
      .query('cards')
      .withIndex('by_workspace_board_position', (q: any) =>
        q.eq('workspaceId', board.workspaceId).eq('boardId', board._id),
      )
      .collect()

    return { board, columns, cards }
  },
  preview: async (_ctx, _args, { board, columns, cards }) => ({
    summary: `Archive "${board.title}"`,
    warn: 'The board disappears from the active workspace view.',
    affects: {
      columns: columns.length,
      cards: cards.length,
    },
  }),
  handler: async (ctx, _args, { board }) => {
    await ctx.db.patch(board._id, {
      archived: true,
      updatedAt: Date.now(),
    })
    return null
  },
})

export { archiveBoardOp }
export const archiveBoard = mutation(archiveBoardOp)
export const previewArchiveBoard = query(previewOf(archiveBoardOp))

import { open, requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import {
  agentCreateCardArgs,
  agentMoveCardArgs,
  archiveBoardArgs,
  createBoardArgs,
  createCardArgs,
  createColumnArgs,
  listBoardsForWorkspaceArgs,
  moveCardArgs,
  renameColumnArgs,
  reorderColumnArgs,
  updateCardArgs,
} from '../shared/schemas/kanban'
import type { Doc, Id } from './_generated/dataModel'
import type { Role } from './auth/actor'
import {
  canArchiveBoard,
  canManageBoardStructure,
  canManageBoards,
  canReadWorkspace,
  canWriteCards,
} from './auth/checks'
import { mutation, query } from './functions'
import { resolveWorkspaceAccess, slugify } from './lib/access'
import { writeAuditEvent } from './lib/audit'
import { POSITION_STEP, moveIdBefore } from './lib/ordering'

type BoardRecord = Doc<'boards'>
type ColumnRecord = Doc<'columns'>
type CardRecord = Doc<'cards'>

function canWriteCardsForRole(role: Role) {
  return ['owner', 'admin', 'member'].includes(role)
}

function canArchiveBoardForRole(role: Role) {
  return ['owner', 'admin'].includes(role)
}

function canManageBoardStructureForRole(role: Role) {
  return ['owner', 'admin'].includes(role)
}

async function listBoardsInWorkspace(
  db: any,
  workspaceId: Id<'workspaces'>,
  includeArchived: boolean,
) {
  const source = includeArchived
    ? db.query('boards').withIndex('by_workspace', (q: any) => q.eq('workspaceId', workspaceId))
    : db
        .query('boards')
        .withIndex('by_workspace_archived', (q: any) =>
          q.eq('workspaceId', workspaceId).eq('archived', false),
        )

  return (await source.collect()) as BoardRecord[]
}

async function listBoardColumns(
  db: any,
  workspaceId: Id<'workspaces'>,
  boardId: Id<'boards'>,
) {
  return (await db
    .query('columns')
    .withIndex('by_workspace_board_position', (q: any) =>
      q.eq('workspaceId', workspaceId).eq('boardId', boardId),
    )
    .collect()) as ColumnRecord[]
}

async function listColumnCards(
  db: any,
  workspaceId: Id<'workspaces'>,
  columnId: Id<'columns'>,
) {
  return (await db
    .query('cards')
    .withIndex('by_workspace_column_position', (q: any) =>
      q.eq('workspaceId', workspaceId).eq('columnId', columnId),
    )
    .collect()) as CardRecord[]
}

async function ensureBoardInWorkspace(
  db: any,
  boardId: Id<'boards'>,
  workspaceId: Id<'workspaces'>,
) {
  const board = (await db.get(boardId)) as BoardRecord | null
  requireRecord(board, 'Board')
  if (board.workspaceId !== workspaceId) {
    throw new Error('Board is outside the active workspace.')
  }
  return board
}

async function ensureColumnInWorkspace(
  db: any,
  columnId: Id<'columns'>,
  workspaceId: Id<'workspaces'>,
) {
  const column = (await db.get(columnId)) as ColumnRecord | null
  requireRecord(column, 'Column')
  if (column.workspaceId !== workspaceId) {
    throw new Error('Column is outside the active workspace.')
  }
  return column
}

async function ensureCardInWorkspace(
  db: any,
  cardId: Id<'cards'>,
  workspaceId: Id<'workspaces'>,
) {
  const card = (await db.get(cardId)) as CardRecord | null
  requireRecord(card, 'Card')
  if (card.workspaceId !== workspaceId) {
    throw new Error('Card is outside the active workspace.')
  }
  return card
}

async function buildBoardView(
  db: any,
  workspaceId: Id<'workspaces'>,
  board: BoardRecord,
  role: Role,
) {
  const workspace = await db.get(workspaceId)
  requireRecord(workspace as Doc<'workspaces'> | null, 'Workspace')

  const columns = await listBoardColumns(db, workspaceId, board._id)
  const columnsWithCards = await Promise.all(
    columns.map(async (column) => ({
      _id: column._id,
      title: column.title,
      position: column.position,
      cards: (await listColumnCards(db, workspaceId, column._id)).map((card) => ({
        _id: card._id,
        title: card.title,
        description: card.description ?? '',
        position: card.position,
      })),
    })),
  )

  return {
    workspace: {
      _id: (workspace as Doc<'workspaces'>)._id,
      name: (workspace as Doc<'workspaces'>).name,
      slug: (workspace as Doc<'workspaces'>).slug,
    },
    board: {
      _id: board._id,
      title: board.title,
      slug: board.slug,
      archived: board.archived,
    },
    permissions: {
      manageBoards: canManageBoardStructureForRole(role),
      manageBoardStructure: canManageBoardStructureForRole(role),
      writeCards: canWriteCardsForRole(role),
      archiveBoard: canArchiveBoardForRole(role),
    },
    columns: columnsWithCards,
  }
}

async function createBoardSlug(
  db: any,
  workspaceId: Id<'workspaces'>,
  title: string,
) {
  const base = slugify(title) || 'board'
  let slug = base
  let suffix = 2

  while (
    await db
      .query('boards')
      .withIndex('by_workspace_slug', (q: any) => q.eq('workspaceId', workspaceId).eq('slug', slug))
      .first()
  ) {
    slug = `${base}-${suffix}`
    suffix += 1
  }

  return slug
}

async function resequenceColumns(
  ctx: any,
  orderedIds: Id<'columns'>[],
) {
  const now = Date.now()
  for (const [index, columnId] of orderedIds.entries()) {
    await ctx.db.patch(columnId, {
      position: index * POSITION_STEP,
      updatedAt: now,
    })
  }
}

async function resequenceCards(
  ctx: any,
  orderedIds: Id<'cards'>[],
  options?: {
    movingCardId?: Id<'cards'>
    toColumnId?: Id<'columns'>
  },
) {
  const now = Date.now()
  for (const [index, cardId] of orderedIds.entries()) {
    await ctx.db.patch(cardId, {
      position: index * POSITION_STEP,
      updatedAt: now,
      ...(options?.movingCardId === cardId && options.toColumnId
        ? { columnId: options.toColumnId }
        : {}),
    })
  }
}

async function resolveBoardByName(
  db: any,
  workspaceId: Id<'workspaces'>,
  boardName?: string,
  includeArchived = false,
): Promise<BoardRecord> {
  const boards = await listBoardsInWorkspace(db, workspaceId, true)
  const available = includeArchived ? boards : boards.filter((board) => !board.archived)

  if (!boardName) {
    if (available.length === 1) {
      const onlyBoard = available[0]
      if (!onlyBoard) throw new Error('Board was not found.')
      return onlyBoard
    }
    throw new Error('Board is required because the workspace has multiple boards.')
  }

  const normalized = boardName.trim().toLowerCase()
  const matches = available.filter((board) => {
    return board.slug.toLowerCase() === normalized || board.title.trim().toLowerCase() === normalized
  })

  if (matches.length === 0) {
    throw new Error(`Board "${boardName}" was not found.`)
  }
  if (matches.length > 1) {
    throw new Error(`Board "${boardName}" is ambiguous. Use the slug instead.`)
  }
  return matches[0]!
}

async function resolveColumnByTitle(
  db: any,
  workspaceId: Id<'workspaces'>,
  boardId: Id<'boards'>,
  title: string,
): Promise<ColumnRecord> {
  const columns = await listBoardColumns(db, workspaceId, boardId)
  const normalized = title.trim().toLowerCase()
  const matches = columns.filter((column) => column.title.trim().toLowerCase() === normalized)
  if (matches.length === 0) {
    throw new Error(`Column "${title}" was not found.`)
  }
  if (matches.length > 1) {
    throw new Error(`Column "${title}" is ambiguous.`)
  }
  return matches[0]!
}

async function resolveCardByTitle(
  db: any,
  workspaceId: Id<'workspaces'>,
  boardId: Id<'boards'>,
  title: string,
): Promise<CardRecord> {
  const columns = await listBoardColumns(db, workspaceId, boardId)
  const cards = (
    await Promise.all(columns.map((column) => listColumnCards(db, workspaceId, column._id)))
  ).flat()
  const normalized = title.trim().toLowerCase()
  const matches = cards.filter((card) => card.title.trim().toLowerCase() === normalized)
  if (matches.length === 0) {
    throw new Error(`Card "${title}" was not found.`)
  }
  if (matches.length > 1) {
    throw new Error(`Card "${title}" is ambiguous. Specify the board more narrowly.`)
  }
  return matches[0]!
}

async function moveCardWithinBoard(
  ctx: any,
  workspaceId: Id<'workspaces'>,
  card: CardRecord,
  toColumn: ColumnRecord,
  beforeCardId?: Id<'cards'>,
) {
  if (card.columnId === toColumn._id) {
    const sameColumnCards = await listColumnCards(ctx.db, workspaceId, card.columnId)
    const order = moveIdBefore(
      sameColumnCards.map((entry) => entry._id),
      card._id,
      beforeCardId && beforeCardId !== card._id ? beforeCardId : undefined,
    )
    await resequenceCards(ctx, order)
    return
  }

  const sourceCards = await listColumnCards(ctx.db, workspaceId, card.columnId)
  const destinationCards = await listColumnCards(ctx.db, workspaceId, toColumn._id)
  const sourceOrder = sourceCards.filter((entry) => entry._id !== card._id).map((entry) => entry._id)
  const destinationOrder = moveIdBefore(
    destinationCards.map((entry) => entry._id),
    card._id,
    beforeCardId,
  )

  await resequenceCards(ctx, sourceOrder)
  await resequenceCards(ctx, destinationOrder, {
    movingCardId: card._id,
    toColumnId: toColumn._id,
  })
}

export const listBoards = query({
  guard: canReadWorkspace,
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const boards = await listBoardsInWorkspace(ctx.db, actor.tenantId, args.includeArchived === true)

    return boards
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((board) => ({
        _id: board._id,
        title: board.title,
        slug: board.slug,
        archived: board.archived,
      }))
  },
})

export const getBoardView = query({
  guard: canReadWorkspace,
  args: {
    boardId: v.id('boards'),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const board = await ensureBoardInWorkspace(ctx.db, args.boardId, actor.tenantId)
    return await buildBoardView(ctx.db, actor.tenantId, board, actor.role)
  },
})

export const createBoard = mutation({
  guard: canManageBoards,
  args: createBoardArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()
    const now = Date.now()
    const title = args.title.trim()
    const slug = await createBoardSlug(ctx.db, actor.tenantId, title)
    const boardId = await ctx.db.insert('boards', {
      workspaceId: actor.tenantId,
      title,
      slug,
      archived: false,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    for (const [index, columnTitle] of ['Inbox', 'Doing', 'Done'].entries()) {
      await ctx.db.insert('columns', {
        workspaceId: actor.tenantId,
        boardId,
        title: columnTitle,
        position: index * POSITION_STEP,
        createdAt: now,
        updatedAt: now,
      })
    }

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'board.created',
      summary: `Created board "${title}".`,
      workspaceId: actor.tenantId,
      boardId: String(boardId),
    })

    return boardId
  },
})

export const createColumn = mutation({
  guard: canManageBoardStructure,
  args: createColumnArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()
    const board = await ensureBoardInWorkspace(ctx.db, args.boardId, actor.tenantId)
    const columns = await listBoardColumns(ctx.db, actor.tenantId, board._id)
    const columnId = await ctx.db.insert('columns', {
      workspaceId: actor.tenantId,
      boardId: board._id,
      title: args.title.trim(),
      position: columns.length * POSITION_STEP,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'column.created',
      summary: `Created column "${args.title.trim()}".`,
      workspaceId: actor.tenantId,
      boardId: String(board._id),
      columnId: String(columnId),
    })

    return columnId
  },
})

export const renameColumn = mutation({
  guard: canManageBoardStructure,
  args: renameColumnArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()
    const column = await ensureColumnInWorkspace(ctx.db, args.columnId, actor.tenantId)
    await ctx.db.patch(column._id, {
      title: args.title.trim(),
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'column.renamed',
      summary: `Renamed a column to "${args.title.trim()}".`,
      workspaceId: actor.tenantId,
      boardId: String(column.boardId),
      columnId: String(column._id),
    })
  },
})

export const reorderColumn = mutation({
  guard: canManageBoardStructure,
  args: reorderColumnArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()
    const column = await ensureColumnInWorkspace(ctx.db, args.columnId, actor.tenantId)
    const columns = await listBoardColumns(ctx.db, actor.tenantId, column.boardId)

    if (args.beforeColumnId) {
      const beforeColumn = await ensureColumnInWorkspace(ctx.db, args.beforeColumnId, actor.tenantId)
      if (beforeColumn.boardId !== column.boardId) {
        throw new Error('Columns must stay within the same board.')
      }
    }

    const order = moveIdBefore(
      columns.map((entry) => entry._id),
      column._id,
      args.beforeColumnId,
    )
    await resequenceColumns(ctx, order)

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'column.reordered',
      summary: `Reordered column "${column.title}".`,
      workspaceId: actor.tenantId,
      boardId: String(column.boardId),
      columnId: String(column._id),
    })
  },
})

export const createCard = mutation({
  guard: canWriteCards,
  args: createCardArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()
    const column = await ensureColumnInWorkspace(ctx.db, args.columnId, actor.tenantId)
    const cards = await listColumnCards(ctx.db, actor.tenantId, column._id)
    const cardId = await ctx.db.insert('cards', {
      workspaceId: actor.tenantId,
      boardId: column.boardId,
      columnId: column._id,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      position: cards.length * POSITION_STEP,
      createdBy: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'card.created',
      summary: `Created card "${args.title.trim()}".`,
      workspaceId: actor.tenantId,
      boardId: String(column.boardId),
      columnId: String(column._id),
      cardId: String(cardId),
    })

    return cardId
  },
})

export const updateCard = mutation({
  guard: canWriteCards,
  args: updateCardArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()
    const card = await ensureCardInWorkspace(ctx.db, args.cardId, actor.tenantId)
    await ctx.db.patch(card._id, {
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'card.updated',
      summary: `Updated card "${args.title.trim()}".`,
      workspaceId: actor.tenantId,
      boardId: String(card.boardId),
      columnId: String(card.columnId),
      cardId: String(card._id),
    })
  },
})

export const moveCard = mutation({
  guard: canWriteCards,
  args: moveCardArgs.args,
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()
    const card = await ensureCardInWorkspace(ctx.db, args.cardId, actor.tenantId)
    const toColumn = await ensureColumnInWorkspace(ctx.db, args.toColumnId, actor.tenantId)

    if (card.boardId !== toColumn.boardId) {
      throw new Error('Cards can only move inside a single board.')
    }

    if (args.beforeCardId) {
      const beforeCard = await ensureCardInWorkspace(ctx.db, args.beforeCardId, actor.tenantId)
      if (beforeCard.columnId !== toColumn._id) {
        throw new Error('Destination card must be inside the destination column.')
      }
    }

    await moveCardWithinBoard(ctx, actor.tenantId, card, toColumn, args.beforeCardId)

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'card.moved',
      summary: `Moved card "${card.title}" to "${toColumn.title}".`,
      workspaceId: actor.tenantId,
      boardId: String(card.boardId),
      columnId: String(toColumn._id),
      cardId: String(card._id),
    })

    return null
  },
})

export const listBoardsForWorkspace = query({
  guard: open,
  args: listBoardsForWorkspaceArgs.args,
  handler: async (ctx, args) => {
    const principal = await ctx.principal()
    const access = await resolveWorkspaceAccess(ctx.db, principal, args.workspace)
    const boards = await listBoardsInWorkspace(
      ctx.db,
      access.workspace._id,
      args.includeArchived === true,
    )

    return boards.map((board) => ({
      _id: board._id,
      title: board.title,
      slug: board.slug,
      archived: board.archived,
      workspace: access.workspace.slug,
    }))
  },
})

export const createCardByAgent = mutation({
  guard: open,
  args: agentCreateCardArgs.args,
  handler: async (ctx, args) => {
    const principal = await ctx.principal()
    const access = await resolveWorkspaceAccess(ctx.db, principal, args.workspace)
    if (!canWriteCardsForRole(access.membership.role)) {
      throw new Error('You do not have permission to create cards in that workspace.')
    }

    const board = await resolveBoardByName(ctx.db, access.workspace._id, args.board)
    const column = await resolveColumnByTitle(ctx.db, access.workspace._id, board._id, args.column)
    const cards = await listColumnCards(ctx.db, access.workspace._id, column._id)

    const cardId = await ctx.db.insert('cards', {
      workspaceId: access.workspace._id,
      boardId: board._id,
      columnId: column._id,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      position: cards.length * POSITION_STEP,
      createdBy: access.user.authId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      principal,
      actor: null,
      action: 'card.created.agent',
      summary: `Agent created card "${args.title.trim()}" in "${column.title}".`,
      workspaceId: access.workspace._id,
      boardId: String(board._id),
      columnId: String(column._id),
      cardId: String(cardId),
    })

    return {
      cardId,
      workspace: access.workspace.slug,
      board: board.slug,
      column: column.title,
    }
  },
})

export const moveCardByAgent = mutation({
  guard: open,
  args: agentMoveCardArgs.args,
  returns: v.null(),
  handler: async (ctx, args) => {
    const principal = await ctx.principal()
    const access = await resolveWorkspaceAccess(ctx.db, principal, args.workspace)
    if (!canWriteCardsForRole(access.membership.role)) {
      throw new Error('You do not have permission to move cards in that workspace.')
    }

    const board = await resolveBoardByName(ctx.db, access.workspace._id, args.board)
    const card = await resolveCardByTitle(ctx.db, access.workspace._id, board._id, args.cardTitle)
    const toColumn = await resolveColumnByTitle(ctx.db, access.workspace._id, board._id, args.toColumn)
    const beforeCard = args.beforeCardTitle
      ? await resolveCardByTitle(ctx.db, access.workspace._id, board._id, args.beforeCardTitle)
      : null

    if (beforeCard && beforeCard.columnId !== toColumn._id) {
      throw new Error('beforeCardTitle must refer to a card already in the destination column.')
    }

    await moveCardWithinBoard(ctx, access.workspace._id, card, toColumn, beforeCard?._id)

    await writeAuditEvent(ctx, {
      principal,
      actor: null,
      action: 'card.moved.agent',
      summary: `Agent moved card "${card.title}" to "${toColumn.title}".`,
      workspaceId: access.workspace._id,
      boardId: String(board._id),
      columnId: String(toColumn._id),
      cardId: String(card._id),
    })

    return null
  },
})

export const archiveBoardOp = defineOperation({
  id: 'boards.archive',
  name: 'archiveBoard',
  kind: 'destructive',
  args: archiveBoardArgs.args,
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        columns: v.number(),
        cards: v.number(),
      }),
    }),
    confirm: v.object({
      operation: v.literal('boards.archive'),
      targetId: v.id('boards'),
      affectedCounts: v.object({
        columns: v.number(),
        cards: v.number(),
      }),
    }),
  }),
  guard: open,
  load: async (ctx: any, args) => {
    const principal = (await ctx.principal()) as import('./auth/principal').KanbanPrincipal

    if (args.boardId) {
      const board = (await ctx.db.get(args.boardId)) as BoardRecord | null
      requireRecord(board, 'Board')
      const access = await resolveWorkspaceAccess(ctx.db, principal, args.workspace)
      if (board.workspaceId !== access.workspace._id) {
        throw new Error('Board is not in the selected workspace.')
      }
      if (!canArchiveBoardForRole(access.membership.role)) {
        throw new Error('You do not have permission to archive boards in that workspace.')
      }

      const columns = await listBoardColumns(ctx.db, board.workspaceId, board._id)
      const cards = (
        await Promise.all(columns.map((column) => listColumnCards(ctx.db, board.workspaceId, column._id)))
      ).flat()

      return { board, columns, cards, access }
    }

    if (!args.board) {
      throw new Error('boardId or board is required.')
    }

    const access = await resolveWorkspaceAccess(ctx.db, principal, args.workspace)
    if (!canArchiveBoardForRole(access.membership.role)) {
      throw new Error('You do not have permission to archive boards in that workspace.')
    }

    const board = await resolveBoardByName(ctx.db, access.workspace._id, args.board, true)
    const columns = await listBoardColumns(ctx.db, access.workspace._id, board._id)
    const cards = (
      await Promise.all(columns.map((column) => listColumnCards(ctx.db, access.workspace._id, column._id)))
    ).flat()

    return { board, columns, cards, access }
  },
  preview: async (_ctx, _args, { board, columns, cards }) => ({
    display: {
      summary: `Archive "${board.title}" and hide it from active board views.`,
      warn: 'Cards and columns stay in the database, but the board disappears from the active workspace.',
      affects: {
        columns: columns.length,
        cards: cards.length,
      },
    },
    confirm: {
      operation: 'boards.archive',
      targetId: board._id,
      affectedCounts: {
        columns: columns.length,
        cards: cards.length,
      },
    },
  }),
  handler: async (ctx: any, _args, { board, access }) => {
    const principal = (await ctx.principal()) as import('./auth/principal').KanbanPrincipal
    const actor = (await ctx.actor()) as import('./auth/actor').Actor | null
    await ctx.db.patch(board._id, {
      archived: true,
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'board.archived',
      summary: `Archived board "${board.title}".`,
      workspaceId: access.workspace._id,
      boardId: String(board._id),
    })

    return null
  },
})

export const archiveBoard = mutation(archiveBoardOp)
export const previewArchiveBoard = query(previewOf(archiveBoardOp))

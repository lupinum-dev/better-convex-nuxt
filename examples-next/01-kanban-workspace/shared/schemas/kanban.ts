import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createWorkspaceArgs = defineArgs({
  description: 'Create a workspace and seed its starter board',
  args: {
    name: v.string(),
    slug: v.string(),
  },
})

export const switchWorkspaceArgs = defineArgs({
  description: 'Switch the current active workspace',
  args: {
    workspaceId: v.id('workspaces'),
  },
})

export const addWorkspaceMemberArgs = defineArgs({
  description: 'Add an existing signed-up user to the active workspace',
  args: {
    email: v.string(),
    role: v.union(
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
  },
})

export const createBoardArgs = defineArgs({
  description: 'Create a new board in the active workspace',
  args: {
    title: v.string(),
  },
})

export const archiveBoardArgs = defineArgs({
  description: 'Archive a board in the active workspace',
  args: {
    boardId: v.optional(v.id('boards')),
    board: v.optional(v.string()),
    workspace: v.optional(v.string()),
  },
})

export const createColumnArgs = defineArgs({
  description: 'Create a new column in a board',
  args: {
    boardId: v.id('boards'),
    title: v.string(),
  },
})

export const renameColumnArgs = defineArgs({
  description: 'Rename a board column',
  args: {
    columnId: v.id('columns'),
    title: v.string(),
  },
})

export const reorderColumnArgs = defineArgs({
  description: 'Move a column before another column or to the end',
  args: {
    columnId: v.id('columns'),
    beforeColumnId: v.optional(v.id('columns')),
  },
})

export const createCardArgs = defineArgs({
  description: 'Create a card in a board column',
  args: {
    columnId: v.id('columns'),
    title: v.string(),
    description: v.optional(v.string()),
  },
})

export const updateCardArgs = defineArgs({
  description: 'Update a card title or description',
  args: {
    cardId: v.id('cards'),
    title: v.string(),
    description: v.optional(v.string()),
  },
})

export const moveCardArgs = defineArgs({
  description: 'Move a card to a column and place it before another card or at the end',
  args: {
    cardId: v.id('cards'),
    toColumnId: v.id('columns'),
    beforeCardId: v.optional(v.id('cards')),
  },
})

export const listBoardsForWorkspaceArgs = defineArgs({
  description: 'List boards in a workspace by name or active selection',
  args: {
    workspace: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
})

export const agentCreateCardArgs = defineArgs({
  description: 'Create a card in a workspace board column by human-readable names',
  args: {
    workspace: v.optional(v.string()),
    board: v.optional(v.string()),
    column: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
  },
})

export const agentMoveCardArgs = defineArgs({
  description: 'Move a card into another column, optionally before another card',
  args: {
    workspace: v.optional(v.string()),
    board: v.optional(v.string()),
    cardTitle: v.string(),
    toColumn: v.string(),
    beforeCardTitle: v.optional(v.string()),
  },
})

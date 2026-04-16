import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createWorkspaceArgs = defineArgs({
  description: 'Create a workspace and seed its starter board',
  args: {
    name: v.string(),
    slug: v.string(),
  },
})

export const joinWorkspaceArgs = defineArgs({
  description: 'Join a workspace in a chosen demo role',
  args: {
    slug: v.string(),
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
})

export const createCardArgs = defineArgs({
  description: 'Create a card in a board column',
  args: {
    columnId: v.id('columns'),
    title: v.string(),
  },
})

export const moveCardArgs = defineArgs({
  description: 'Move a card left or right between adjacent board columns',
  args: {
    id: v.id('cards'),
    direction: v.union(v.literal('left'), v.literal('right')),
  },
})

export const archiveBoardArgs = defineArgs({
  description: 'Archive the current board',
  args: {
    id: v.id('boards'),
  },
})


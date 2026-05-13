import { defineArgs } from '@lupinum/trellis/args'
import { open } from '@lupinum/trellis/auth'

import { createNote, searchNotes } from '../shared/schemas/note'
import { mutation, query } from './functions'

const listNotesArgs = defineArgs({
  args: {},
})

function withTitle<T extends { title?: string | null }>(note: T) {
  return {
    ...note,
    title: note.title ?? 'Untitled',
  }
}

export const list = query.public({
  args: listNotesArgs.args,
  handler: async (ctx) => {
    const notes = await ctx.db.query('notes').order('desc').take(50)
    return notes.map(withTitle)
  },
})

export const search = query.public({
  args: searchNotes.args,
  handler: async (ctx, args) => {
    if (!args.query.trim()) return []

    const notes = await ctx.db.query('notes').order('desc').take(200)
    const lowerQuery = args.query.toLowerCase()

    return notes
      .filter(
        (note) =>
          (note.title ?? '').toLowerCase().includes(lowerQuery) ||
          note.content.toLowerCase().includes(lowerQuery),
      )
      .map(withTitle)
  },
})

export const add = mutation.protected({
  args: createNote.args,
  identityForwardingFunctionRef: 'notes:add',
  guard: open,
  handler: async (ctx, args) => {
    return await ctx.db.insert('notes', {
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
    })
  },
})

import { v } from 'convex/values'

import {
  createNote as createNoteSchema,
  deleteNote as deleteNoteSchema,
  updateNote as updateNoteSchema,
} from '../../shared/schemas/note'
import { mutation, query } from '../_generated/server'

const listNotesArgs = {
  _orgId: v.string(),
}

const getNoteArgs = {
  id: v.id('notes'),
  _orgId: v.string(),
}

const createNoteArgs = {
  ...createNoteSchema.args,
  _orgId: v.string(),
}

const updateNoteArgs = {
  ...updateNoteSchema.args,
  _orgId: v.string(),
}

const deleteNoteArgs = {
  ...deleteNoteSchema.args,
  _orgId: v.string(),
}

function withTitle<T extends { title?: string | null }>(note: T) {
  return {
    ...note,
    title: note.title ?? 'Untitled',
  }
}

export const listNotes = query({
  args: listNotesArgs,
  handler: async (ctx, args) => {
    void args
    const notes = await ctx.db.query('notes').order('desc').collect()
    return notes.map(withTitle)
  },
})

export const getNote = query({
  args: getNoteArgs,
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id)
    if (!note || note.userId !== args._orgId) return null
    return withTitle(note)
  },
})

export const createNote = mutation({
  args: createNoteArgs,
  handler: async (ctx, args) => {
    return await ctx.db.insert('notes', {
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
      userId: args._orgId,
    })
  },
})

export const updateNote = mutation({
  args: updateNoteArgs,
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id)
    if (!note || note.userId !== args._orgId) {
      throw new Error('Note not found')
    }

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
    })
  },
})

export const deleteNote = mutation({
  args: deleteNoteArgs,
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id)
    if (!note || note.userId !== args._orgId) {
      throw new Error('Note not found')
    }

    await ctx.db.delete(args.id)
  },
})

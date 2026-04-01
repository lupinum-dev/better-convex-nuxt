import { mutation, query } from './_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { defineArgs } from 'better-convex-nuxt/schema'

import {
  createNote,
  deleteNote,
  searchNotes,
  updateNote,
} from '../shared/schemas/note'

const listNotesArgs = defineArgs({
  args: {},
})

const listPaginatedNotesArgs = defineArgs({
  args: {
    paginationOpts: paginationOptsValidator,
  },
})

const getNoteArgs = defineArgs({
  args: {
    id: v.id('notes'),
  },
})

function withTitle<T extends { title?: string | null }>(note: T) {
  return {
    ...note,
    title: note.title ?? 'Untitled',
  }
}

export const list = query({
  args: listNotesArgs.args,
  handler: async (ctx) => {
    const notes = await ctx.db.query('notes').order('desc').take(50)
    return notes.map(withTitle)
  },
})

export const listPaginated = query({
  args: listPaginatedNotesArgs.args,
  handler: async (ctx, args) => {
    const result = await ctx.db.query('notes').order('desc').paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map(withTitle),
    }
  },
})

export const listPaginatedAsc = query({
  args: listPaginatedNotesArgs.args,
  handler: async (ctx, args) => {
    const result = await ctx.db.query('notes').order('asc').paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map(withTitle),
    }
  },
})

export const get = query({
  args: getNoteArgs.args,
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id)
    return note ? withTitle(note) : null
  },
})

export const search = query({
  args: searchNotes.args,
  handler: async (ctx, args) => {
    if (!args.query.trim()) return []

    // The playground keeps note search intentionally simple, but bound the scan
    // so the MCP-facing demo does not read an unbounded table.
    const notes = await ctx.db.query('notes').order('desc').take(200)
    const lowerQuery = args.query.toLowerCase()

    return notes
      .filter(note =>
        (note.title ?? '').toLowerCase().includes(lowerQuery)
        || note.content.toLowerCase().includes(lowerQuery),
      )
      .map(withTitle)
  },
})

export const add = mutation({
  args: createNote.args,
  handler: async (ctx, args) => {
    return await ctx.db.insert('notes', {
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: updateNote.args,
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id)
    if (!note) throw new Error('Note not found')

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
    })
  },
})

export const count = query({
  args: {},
  handler: async (ctx) => {
    const notes = await ctx.db.query('notes').collect()
    return { total: notes.length }
  },
})

export const remove = mutation({
  args: deleteNote.args,
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})

export const listDelayed = query({
  args: listNotesArgs.args,
  handler: async (ctx) => {
    const notes = await ctx.db.query('notes').order('desc').take(50)
    return notes.map(withTitle)
  },
})

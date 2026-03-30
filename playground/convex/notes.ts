import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import {
  publicMutation,
  publicQuery,
} from './functions'
import { createNote } from '../shared/schemas/note'

function withTitle<T extends { title?: string | null }>(note: T) {
  return {
    ...note,
    title: note.title ?? 'Untitled',
  }
}

export const list = publicQuery({
  args: {},
  handler: async ({ db }) => {
    const notes = await db.query('notes').order('desc').take(50)
    return notes.map(withTitle)
  },
})

export const listPaginated = publicQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async ({ db }, args) => {
    const result = await db.query('notes').order('desc').paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map(withTitle),
    }
  },
})

export const listPaginatedAsc = publicQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async ({ db }, args) => {
    const result = await db.query('notes').order('asc').paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map(withTitle),
    }
  },
})

export const get = publicQuery({
  args: { id: v.id('notes') },
  handler: async ({ db }, args) => {
    const note = await db.get(args.id)
    return note ? withTitle(note) : null
  },
})

export const search = publicQuery({
  args: { query: v.string() },
  handler: async ({ db }, args) => {
    if (!args.query.trim()) return []

    const notes = await db.query('notes').collect()
    const lowerQuery = args.query.toLowerCase()

    return notes
      .filter(note =>
        (note.title ?? '').toLowerCase().includes(lowerQuery)
        || note.content.toLowerCase().includes(lowerQuery),
      )
      .map(withTitle)
  },
})

export const add = publicMutation({
  args: createNote.validators,
  handler: async ({ db }, args) => {
    return await db.insert('notes', {
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
    })
  },
})

export const update = publicMutation({
  args: {
    id: v.id('notes'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const note = await db.get(args.id)
    if (!note) throw new Error('Note not found')

    await db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
    })
  },
})

export const count = publicQuery({
  args: {},
  handler: async ({ db }) => {
    const notes = await db.query('notes').collect()
    return { total: notes.length }
  },
})

export const remove = publicMutation({
  args: { id: v.id('notes') },
  handler: async ({ db }, args) => {
    await db.delete(args.id)
  },
})

export const listDelayed = publicQuery({
  args: {},
  handler: async ({ db }) => {
    const notes = await db.query('notes').order('desc').take(50)
    return notes.map(withTitle)
  },
})

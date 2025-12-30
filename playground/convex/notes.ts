import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query, mutation } from './_generated/server'

// Public notes - no auth required (for demo purposes)

// Get all notes (public)
export const list = query({
  args: {},
  handler: async (ctx) => {
    const notes = await ctx.db.query('notes').order('desc').take(50)

    // Handle notes with missing title (backward compatibility)
    return notes.map((note) => ({
      ...note,
      title: note.title ?? 'Untitled',
    }))
  },
})

// Get notes with pagination (public) - descending order (newest first)
export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query('notes').order('desc').paginate(args.paginationOpts)

    // Handle notes with missing title (backward compatibility)
    return {
      ...result,
      page: result.page.map((note) => ({
        ...note,
        title: note.title ?? 'Untitled',
      })),
    }
  },
})

// Get notes with pagination - ascending order (oldest first)
export const listPaginatedAsc = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query('notes').order('asc').paginate(args.paginationOpts)

    return {
      ...result,
      page: result.page.map((note) => ({
        ...note,
        title: note.title ?? 'Untitled',
      })),
    }
  },
})

// Get a single note by ID (public)
export const get = query({
  args: { id: v.id('notes') },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id)
    if (!note) return null
    return {
      ...note,
      title: note.title ?? 'Untitled',
    }
  },
})

// Search notes by content (public)
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return []
    }

    const notes = await ctx.db.query('notes').collect()
    const lowerQuery = args.query.toLowerCase()

    return notes
      .filter(
        (note) =>
          (note.title ?? '').toLowerCase().includes(lowerQuery) ||
          note.content.toLowerCase().includes(lowerQuery),
      )
      .map((note) => ({
        ...note,
        title: note.title ?? 'Untitled',
      }))
  },
})

// Add a new note (public for demo)
export const add = mutation({
  args: {
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const noteId = await ctx.db.insert('notes', {
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
    })
    return noteId
  },
})

// Delete a note
export const remove = mutation({
  args: { id: v.id('notes') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})

import { v } from 'convex/values'

import { defineArgs } from '../../../src/runtime/schema'

export const createNote = defineArgs({
  description: 'Create a new note',
  args: {
    title: v.string(),
    content: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'The note title',
      examples: ['Meeting Notes', 'Quick Idea'],
    },
    content: {
      label: 'Content',
      description: 'The note body text',
      examples: ['# My Note\nSome content here'],
    },
  },
})

export const deleteNote = defineArgs({
  description: 'Permanently delete a note',
  args: {
    id: v.id('notes'),
  },
  meta: {
    id: { label: 'Note ID', description: 'The ID of the note to delete' },
  },
})

export const updateNote = defineArgs({
  description: 'Update an existing note',
  args: {
    id: v.id('notes'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  meta: {
    id: { label: 'Note ID', description: 'The note to update' },
    title: {
      label: 'Title',
      description: 'New title (optional)',
      examples: ['Updated Title'],
    },
    content: { label: 'Content', description: 'New content (optional)' },
  },
})

export const searchNotes = defineArgs({
  description: 'Search notes by title or content',
  args: {
    query: v.string(),
  },
  meta: {
    query: {
      label: 'Search query',
      description: 'Text to search for in titles and content',
      examples: ['meeting', 'TODO'],
    },
  },
})

export const bulkDeleteNotes = defineArgs({
  description: 'Delete multiple notes at once (max 10)',
  args: {
    ids: v.array(v.id('notes')),
  },
  meta: {
    ids: {
      label: 'Note IDs',
      description: 'Array of note IDs to delete',
      examples: [['id1', 'id2']],
    },
  },
})

export const exportNotes = defineArgs({
  description: 'Export all notes in the specified format',
  args: {
    format: v.union(v.literal('json'), v.literal('csv')),
  },
  meta: {
    format: {
      label: 'Format',
      description: 'Export format',
      enum: ['json', 'csv'],
    },
  },
})

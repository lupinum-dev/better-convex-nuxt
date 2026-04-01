import { v } from 'convex/values'

import { defineArgs } from '../../../../src/runtime/schema'

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

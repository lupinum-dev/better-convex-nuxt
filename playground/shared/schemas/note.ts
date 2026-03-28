import type { ConvexSchemaMetaFor } from 'better-convex-nuxt/schema'
/**
 * Shared note schema — define once, use everywhere.
 *
 * This file ONLY depends on convex/values, so it can be safely imported
 * from both convex/ functions and Nuxt app code (including MCP tools).
 */
import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

export const createNoteArgs = {
  title: v.string(),
  content: v.string(),
} satisfies PropertyValidators

export const createNoteMeta = {
  description: 'Create a new note',
  fields: {
    title: { label: 'Title', description: 'The note title', examples: ['Meeting Notes', 'Quick Idea'] },
    content: { label: 'Content', description: 'The note body text', examples: ['# My Note\nSome content here'] },
  },
} satisfies ConvexSchemaMetaFor<typeof createNoteArgs>

export const deleteNoteArgs = {
  id: v.id('notes'),
} satisfies PropertyValidators

export const deleteNoteMeta = {
  description: 'Permanently delete a note',
  fields: {
    id: { label: 'Note ID', description: 'The ID of the note to delete' },
  },
} satisfies ConvexSchemaMetaFor<typeof deleteNoteArgs>

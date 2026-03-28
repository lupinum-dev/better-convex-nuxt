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

// ── Update note ──────────────────────────────────────────────────────────────

export const updateNoteArgs = {
  id: v.id('notes'),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
} satisfies PropertyValidators

export const updateNoteMeta = {
  description: 'Update an existing note',
  fields: {
    id: { label: 'Note ID', description: 'The note to update' },
    title: { label: 'Title', description: 'New title (optional)', examples: ['Updated Title'] },
    content: { label: 'Content', description: 'New content (optional)' },
  },
} satisfies ConvexSchemaMetaFor<typeof updateNoteArgs>

// ── Search notes ─────────────────────────────────────────────────────────────

export const searchNotesArgs = {
  query: v.string(),
} satisfies PropertyValidators

export const searchNotesMeta = {
  description: 'Search notes by title or content',
  fields: {
    query: { label: 'Search query', description: 'Text to search for in titles and content', examples: ['meeting', 'TODO'] },
  },
} satisfies ConvexSchemaMetaFor<typeof searchNotesArgs>

// ── Bulk delete notes ────────────────────────────────────────────────────────

export const bulkDeleteNotesArgs = {
  ids: v.array(v.id('notes')),
} satisfies PropertyValidators

export const bulkDeleteNotesMeta = {
  description: 'Delete multiple notes at once (max 10)',
  fields: {
    ids: { label: 'Note IDs', description: 'Array of note IDs to delete', examples: [['id1', 'id2']] },
  },
} satisfies ConvexSchemaMetaFor<typeof bulkDeleteNotesArgs>

// ── Export notes ─────────────────────────────────────────────────────────────

export const exportNotesArgs = {
  format: v.union(v.literal('json'), v.literal('csv')),
} satisfies PropertyValidators

export const exportNotesMeta = {
  description: 'Export all notes in the specified format',
  fields: {
    format: { label: 'Format', description: 'Export format', enum: ['json', 'csv'] },
  },
} satisfies ConvexSchemaMetaFor<typeof exportNotesArgs>

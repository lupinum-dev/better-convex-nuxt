import type { ConvexSchemaMetaBase, ConvexSchemaMetaFor } from 'better-convex-nuxt/schema'
/**
 * Shared comment schema — define once, use everywhere.
 *
 * Comments are nested under posts and scoped to organizations.
 */
import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export const createCommentArgs = {
  postId: v.id('posts'),
  content: v.string(),
} satisfies PropertyValidators

export const updateCommentArgs = {
  id: v.id('comments'),
  content: v.string(),
} satisfies PropertyValidators

export const deleteCommentArgs = {
  id: v.id('comments'),
} satisfies PropertyValidators

export const listCommentsByPostArgs = {
  postId: v.id('posts'),
} satisfies PropertyValidators

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const createCommentMeta = {
  description: 'Add a comment to a post',
  fields: {
    postId: { label: 'Post', description: 'The post to comment on' },
    content: { label: 'Comment', description: 'The comment text' },
  },
} satisfies ConvexSchemaMetaFor<typeof createCommentArgs>

export const updateCommentMeta = {
  description: 'Edit an existing comment',
  fields: {
    id: { label: 'Comment ID', description: 'The comment to update' },
    content: { label: 'Comment', description: 'New comment text' },
  },
} satisfies ConvexSchemaMetaFor<typeof updateCommentArgs>

export const deleteCommentMeta = {
  description: 'Delete a comment',
  fields: {
    id: { label: 'Comment ID', description: 'The comment to delete' },
  },
} satisfies ConvexSchemaMetaFor<typeof deleteCommentArgs>

export const listCommentsByPostMeta = {
  description: 'List all comments on a post',
  fields: {
    postId: { label: 'Post', description: 'The post to list comments for' },
  },
} satisfies ConvexSchemaMetaFor<typeof listCommentsByPostArgs>

// ---------------------------------------------------------------------------
// Table-level metadata — declares tenant scoping intent
// ---------------------------------------------------------------------------

export const commentTableMeta = {
  description: 'Comments on blog posts',
  tenant: { scoped: true, ownerField: 'ownerId' },
} satisfies ConvexSchemaMetaBase

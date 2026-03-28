/**
 * Shared post schema — define once, use everywhere.
 *
 * This file ONLY depends on convex/values, so it can be safely imported
 * from both convex/ functions and Nuxt app code.
 *
 * Usage:
 *   convex/posts.ts  → mutation({ args: createPostArgs, handler: ... })
 *   app composable   → defineConvexSchema(createPostArgs, createPostMeta)
 *   server route     → readValidatedBody(event, schema.validate)
 *   MCP tool         → defineMcpTool({ inputSchema: await schema.toMcpInput() })
 */
import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

// ---------------------------------------------------------------------------
// Validators — the single source of truth
// ---------------------------------------------------------------------------

export const createPostArgs = {
  title: v.string(),
  content: v.string(),
  status: v.optional(v.union(v.literal('draft'), v.literal('published'))),
} satisfies PropertyValidators

export const updatePostArgs = {
  id: v.id('posts'),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
} satisfies PropertyValidators

// ---------------------------------------------------------------------------
// Metadata — labels and descriptions for forms / MCP tools
// Keep this alongside validators so both stay in sync.
// ---------------------------------------------------------------------------

export const createPostMeta = {
  description: 'Create a new blog post',
  fields: {
    title: { label: 'Title', description: 'The post title' },
    content: { label: 'Content', description: 'Post body in markdown' },
    status: { label: 'Status', description: 'Draft or published' },
  },
}

export const updatePostMeta = {
  description: 'Update an existing blog post',
  fields: {
    id: { label: 'Post ID', description: 'The post to update' },
    title: { label: 'Title', description: 'New title (optional)' },
    content: { label: 'Content', description: 'New content (optional)' },
  },
}

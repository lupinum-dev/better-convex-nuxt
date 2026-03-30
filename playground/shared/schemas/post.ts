import { v } from 'convex/values'

import {
  defineSchema,
  defineTableMeta,
} from '../../../src/runtime/schema'

export const createPost = defineSchema({
  description: 'Create a new blog post',
  args: {
    title: v.string(),
    content: v.string(),
  },
  meta: {
    title: { label: 'Title', description: 'The post title' },
    content: { label: 'Content', description: 'Post body in markdown' },
  },
})

export const updatePost = defineSchema({
  description: 'Update an existing blog post',
  args: {
    id: v.id('posts'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  meta: {
    id: { label: 'Post ID', description: 'The post to update' },
    title: { label: 'Title', description: 'New title (optional)' },
    content: { label: 'Content', description: 'New content (optional)' },
  },
})

export const deletePost = defineSchema({
  description: 'Permanently delete a post',
  args: {
    id: v.id('posts'),
  },
  meta: {
    id: { label: 'Post ID', description: 'The post to delete' },
  },
})

export const postTable = defineTableMeta({
  description: 'Blog posts',
  tenant: { scoped: true, ownerField: 'ownerId' },
})

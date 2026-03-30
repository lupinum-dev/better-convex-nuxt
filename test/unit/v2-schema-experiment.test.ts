import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineSchema, defineTableMeta } from '../helpers/v2-schema-experiment'

describe('v2 schema experiment', () => {
  it('produces validators, meta, zod, and parse from one definition', () => {
    const schema = defineSchema({
      description: 'Create a new blog post',
      args: {
        title: v.string(),
        content: v.string(),
        status: v.union(v.literal('draft'), v.literal('published')),
        tags: v.optional(v.array(v.string())),
        postId: v.id('posts'),
      },
      meta: {
        title: { label: 'Title', description: 'The post title' },
      },
    })

    expect(schema.validators.title).toBeDefined()
    expect(schema.meta.description).toBe('Create a new blog post')
    expect(schema.meta.fields.title.label).toBe('Title')
    expect(schema.meta.fields.title.description).toBe('The post title')
    expect(schema.meta.fields.content.label).toBe('Content')
    expect(schema.meta.fields.content.description).toBe('A string value')
    expect(schema.meta.fields.postId.description).toBe('A reference to a posts document')

    const parsed = schema.parse({
      title: 'Hello',
      content: 'World',
      status: 'draft',
      postId: 'posts:123',
    })

    expect(parsed).toEqual({
      title: 'Hello',
      content: 'World',
      status: 'draft',
      postId: 'posts:123',
    })

    expect(
      schema.zod.parse({
        title: 'Hello',
        content: 'World',
        status: 'published',
        tags: ['a', 'b'],
        postId: 'posts:123',
      }),
    ).toEqual({
      title: 'Hello',
      content: 'World',
      status: 'published',
      tags: ['a', 'b'],
      postId: 'posts:123',
    })
  })

  it('rejects invalid input through zod and parse', () => {
    const schema = defineSchema({
      args: {
        title: v.string(),
        status: v.union(v.literal('draft'), v.literal('published')),
      },
    })

    expect(() => schema.parse({ title: 42, status: 'draft' })).toThrow()
    expect(() => schema.zod.parse({ title: 'ok', status: 'archived' })).toThrow()
  })

  it('handles optional fields', () => {
    const schema = defineSchema({
      args: {
        title: v.string(),
        subtitle: v.optional(v.string()),
      },
    })

    expect(schema.parse({ title: 'Hello' })).toEqual({ title: 'Hello' })
    expect(schema.parse({ title: 'Hello', subtitle: 'World' })).toEqual({
      title: 'Hello',
      subtitle: 'World',
    })
  })

  it('passes through table metadata for scoped tables', () => {
    const meta = defineTableMeta({
      description: 'Blog posts',
      tenant: { scoped: true, ownerField: 'ownerId' as const },
    })

    expect(meta).toEqual({
      description: 'Blog posts',
      tenant: { scoped: true, ownerField: 'ownerId' },
    })
  })
})

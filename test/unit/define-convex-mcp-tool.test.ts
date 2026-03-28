import type { McpToolExtra } from '@nuxtjs/mcp-toolkit/server'
import { v } from 'convex/values'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import { defineConvexMcpTool } from '../../src/runtime/mcp/index'
import { defineConvexSchema } from '../../src/runtime/utils/define-convex-schema'

describe('defineConvexMcpTool', () => {
  it('infers handler args from the shared Convex schema', async () => {
    const schema = defineConvexSchema({
      title: v.string(),
      priority: v.optional(v.union(v.literal('low'), v.literal('high'))),
    })

    const tool = defineConvexMcpTool({
      schema,
      handler: async (args, extra) => {
        expectTypeOf(args).toEqualTypeOf<{
          title: string
          priority?: 'low' | 'high' | undefined
        }>()
        expectTypeOf(extra).toEqualTypeOf<McpToolExtra>()
        return args.title
      },
    })

    expect(await tool.handler({ title: 'Ship it' }, {} as McpToolExtra)).toBe('Ship it')
  })

  it('defaults the tool description from schema metadata', () => {
    const schema = defineConvexSchema(
      {
        title: v.string(),
      },
      {
        description: 'Create a task',
        fields: {
          title: { description: 'Task title' },
        },
      },
    )

    const tool = defineConvexMcpTool({
      schema,
      handler: async ({ title }) => title,
    })

    expect(tool.description).toBe('Create a task')
    expect(tool.inputSchema.title.description).toBe('Task title')
  })

  it('allows overriding the default description', () => {
    const schema = defineConvexSchema(
      {
        title: v.string(),
      },
      {
        description: 'Create a task',
        fields: {
          title: { description: 'Task title' },
        },
      },
    )

    const tool = defineConvexMcpTool({
      schema,
      description: 'Custom tool description',
      handler: async ({ title }) => title,
    })

    expect(tool.description).toBe('Custom tool description')
  })

  it('builds a working Zod input schema from Convex validators', () => {
    const tool = defineConvexMcpTool({
      schema: defineConvexSchema(
        {
          title: v.string(),
          age: v.float64(),
          active: v.boolean(),
          userId: v.id('users'),
          tags: v.array(v.string()),
          status: v.union(v.literal('draft'), v.literal('published')),
          meta: v.object({
            views: v.float64(),
          }),
          props: v.record(v.string(), v.float64()),
          priority: v.optional(v.literal('high')),
        },
        {
          fields: {
            title: { description: 'Title' },
            age: { description: 'Age' },
            active: { description: 'Active flag' },
            userId: { description: 'User ID' },
            tags: { description: 'Tags' },
            status: { description: 'Status' },
            meta: { description: 'Metadata' },
            props: { description: 'Properties' },
            priority: { description: 'Priority' },
          },
        },
      ),
      handler: async (args) => args,
    })

    const parser = z.object(tool.inputSchema)
    const value = parser.parse({
      title: 'Hello',
      age: 3,
      active: true,
      userId: 'abc123',
      tags: ['a', 'b'],
      status: 'draft',
      meta: { views: 10 },
      props: { width: 12 },
    })

    expect(value.title).toBe('Hello')
    expect(tool.inputSchema.status.description).toBe('Status')
    expect(() =>
      parser.parse({
        title: 'Hello',
        age: '3',
        active: true,
        userId: 'abc123',
        tags: ['a'],
        status: 'draft',
        meta: { views: 10 },
        props: { width: 12 },
      }),
    ).toThrow()
  })

  it('fails fast on unsupported Convex validators', () => {
    const schema = defineConvexSchema({
      payload: v.bytes(),
    })

    expect(() =>
      defineConvexMcpTool({
        schema,
        handler: async (args) => args,
      }),
    ).toThrow()
  })
})

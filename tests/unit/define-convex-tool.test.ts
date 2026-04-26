import { v } from 'convex/values'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/convex/server/convex'
import { defineOperation, previewOf } from '../../src/runtime/functions/define-operation'
import { defineTool } from '../../src/runtime/mcp/define-convex-tool'
import { defineMcpApp } from '../../src/runtime/mcp/define-mcp-app'
import { ToolRateLimiter } from '../../src/runtime/mcp/rate-limiter'
import { defineArgs } from '../../src/runtime/schema'
import { createServerConvexCaller } from '../../src/runtime/server'

const { useEventMock } = vi.hoisted(() => ({
  useEventMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useEvent: useEventMock,
}))

vi.mock('../../src/runtime/convex/server/convex', () => ({
  serverConvexQuery: vi.fn(),
  serverConvexMutation: vi.fn(),
  serverConvexAction: vi.fn(),
}))

function createEvent(auth?: { role?: string; userId?: string; tenantId?: string }): H3Event {
  return {
    __is_event__: true,
    method: 'POST',
    path: '/mcp',
    headers: new Headers(),
    context: {
      ...(auth ? { mcpAuth: auth } : {}),
    },
    node: {
      req: {},
      res: {},
    },
  } as unknown as H3Event
}

const emptySchema = defineArgs({
  description: 'Test tool',
  args: {},
})

const scopedSchema = defineArgs({
  description: 'Scoped tool',
  args: {
    title: v.string(),
  },
})

let rateLimitStore: ToolRateLimiter

describe('defineTool MCP input projection', () => {
  it('projects ids, arrays, records, nested objects, and literal unions into JSON-schema-safe Zod', () => {
    const schema = defineArgs({
      description: 'Projected tool',
      args: {
        postId: v.id('posts'),
        workspaceId: v.optional(v.id('workspaces')),
        tagIds: v.array(v.id('tags')),
        labels: v.union(v.string(), v.record(v.string(), v.string())),
        filters: v.object({
          ownerId: v.id('users'),
          metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.null()))),
        }),
        visibility: v.optional(v.union(v.literal('public'), v.literal('draft'))),
      },
      meta: {
        postId: {
          description: 'The post to load.',
        },
      },
    })

    const tool = defineTool({
      schema,
      name: 'projected-tool',
      handler: async (args, ctx) => ctx.ok(args),
    })

    const inputShape = tool.inputSchema ?? {}
    const inputSchema = z.object(inputShape)

    expect(() => z.toJSONSchema(inputSchema)).not.toThrow()
    expect(inputShape.postId?.description).toContain('Convex ID for "posts" table')
    expect(inputShape.postId?.description).toContain('The post to load.')

    expect(
      inputSchema.safeParse({
        postId: 'post_1',
        tagIds: ['tag_1', 'tag_2'],
        labels: { en: 'Hello' },
        filters: { ownerId: 'user_1' },
        visibility: 'public',
      }).success,
    ).toBe(true)

    expect(
      inputSchema.safeParse({
        postId: 'post_1',
        workspaceId: undefined,
        tagIds: ['tag_1'],
        labels: 'Hello',
        filters: {
          ownerId: 'user_1',
          metadata: {
            section: 'hero',
            priority: 1,
            fallback: null,
          },
        },
      }).success,
    ).toBe(true)
  })

  it('fails fast on unions containing ids', () => {
    const schema = defineArgs({
      description: 'Ambiguous tool',
      args: {
        target: v.union(v.id('posts'), v.string()),
      },
    })

    expect(() =>
      defineTool({
        schema,
        name: 'ambiguous-tool',
        handler: async (args, ctx) => ctx.ok(args),
      }),
    ).toThrow(/v\.union\(\) containing v\.id\(\) at "target" cannot be projected/)
  })

  it('fails fast on unsupported validator kinds', () => {
    const schema = defineArgs({
      description: 'Unsupported tool',
      args: {
        count: v.int64(),
      },
    })

    expect(() =>
      defineTool({
        schema,
        name: 'unsupported-tool',
        handler: async (args, ctx) => ctx.ok(args),
      }),
    ).toThrow(/validator kind "int64" at "count" is not supported/)
  })
})

describe('defineTool visibility and auth parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitStore = new ToolRateLimiter()
    useEventMock.mockReturnValue(createEvent())
  })

  afterEach(() => {
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
  })

  it('hides auth-required tools for anonymous callers', async () => {
    const tool = defineTool({
      schema: emptySchema,
      name: 'private-tool',
      auth: 'required',
      handler: async (_args, ctx) => ctx.ok({ ok: true }),
    })

    await expect(tool.enabled?.(createEvent())).resolves.toBe(false)
  })

  it('hides check-denied tools during discovery', async () => {
    const tool = defineTool({
      schema: emptySchema,
      name: 'member-only-tool',
      auth: 'required',
      check: (actor) => actor.role === 'member',
      handler: async (_args, ctx) => ctx.ok({ ok: true }),
    })

    await expect(
      tool.enabled?.(createEvent({ role: 'viewer', userId: 'viewer-1', tenantId: 'org-1' })),
    ).resolves.toBe(false)
    await expect(
      tool.enabled?.(createEvent({ role: 'member', userId: 'member-1', tenantId: 'org-1' })),
    ).resolves.toBe(true)
  })

  it('hides scoped tools when the actor has no tenantId', async () => {
    const tool = defineTool({
      schema: scopedSchema,
      name: 'scoped-tool',
      auth: 'required',
      scoped: true,
      handler: async (_args, ctx) => ctx.ok({ ok: true }),
    })

    await expect(tool.enabled?.(createEvent({ role: 'member', userId: 'member-1' }))).resolves.toBe(
      false,
    )
    await expect(
      tool.enabled?.(createEvent({ role: 'member', userId: 'member-1', tenantId: 'org-1' })),
    ).resolves.toBe(true)
  })

  it('keeps handler-time auth errors aligned when execution bypasses discovery', async () => {
    const tool = defineTool({
      schema: emptySchema,
      name: 'guarded-tool',
      auth: 'required',
      check: (actor) => actor.role === 'member',
      handler: async (_args, ctx) => ctx.ok({ ok: true }),
    })

    useEventMock.mockReturnValue(
      createEvent({ role: 'viewer', userId: 'viewer-1', tenantId: 'org-1' }),
    )

    const result = await tool.handler({} as never, {} as never)

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          category: 'auth',
          message: 'Forbidden.',
        },
      },
    })
  })
})

describe('defineTool error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitStore = new ToolRateLimiter()
    useEventMock.mockReturnValue(createEvent({ role: 'member', userId: 'member-1' }))
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'test-trusted-forwarding-key'
  })

  afterEach(() => {
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
  })

  it('cleans internal transport noise from convex errors', async () => {
    vi.mocked(serverConvexQuery).mockRejectedValueOnce(
      new Error(
        '[serverConvexQuery] Request failed for posts:list via http://localhost/api. ' +
          'Server Error\nUncaught Error: Unauthorized access\n    at Object.handler (file.ts:10:5)',
      ),
    )

    const tool = defineTool({
      schema: emptySchema,
      name: 'query-tool',
      auth: 'required',
      handler: async (_args, ctx) => {
        await ctx.query('posts:list' as never)
        return ctx.ok({ ok: true })
      },
    })

    const result = await tool.handler({} as never, {} as never)

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          message: 'Unauthorized access',
          category: 'auth',
        },
      },
    })
  })

  it('infers categories from cleaned messages when convex metadata is missing', async () => {
    vi.mocked(serverConvexMutation).mockRejectedValueOnce(
      new Error('[Request ID: abc-123] Not found'),
    )

    const tool = defineTool({
      schema: emptySchema,
      name: 'mutation-tool',
      auth: 'required',
      handler: async (_args, ctx) => {
        await ctx.mutation('posts:create' as never)
        return ctx.ok({ ok: true })
      },
    })

    const result = await tool.handler({} as never, {} as never)

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          message: 'Not found',
          category: 'not_found',
        },
      },
    })
  })

  it('preserves unknown category when no message heuristic applies', async () => {
    vi.mocked(serverConvexAction).mockRejectedValueOnce(new Error('Something unexpected happened'))

    const tool = defineTool({
      schema: emptySchema,
      name: 'action-tool',
      auth: 'required',
      handler: async (_args, ctx) => {
        await ctx.action('posts:sync' as never)
        return ctx.ok({ ok: true })
      },
    })

    const result = await tool.handler({} as never, {} as never)

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          message: 'Something unexpected happened',
          category: 'unknown',
        },
      },
    })
  })
})

describe('defineTool trusted principal forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEventMock.mockReturnValue(
      createEvent({ role: 'member', userId: 'member-1', tenantId: 'org-1' }),
    )
  })

  afterEach(() => {
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
  })

  it('builds trusted forwarded calls through resolvePrincipal', async () => {
    vi.mocked(serverConvexMutation).mockResolvedValueOnce('post-1')

    const tool = defineTool({
      schema: scopedSchema,
      name: 'principal-aware-tool',
      auth: 'required',
      scoped: true,
      resolvePrincipal: ({ actor }) => ({
        kind: 'agent',
        agentId: actor.userId,
        subject: `agent:${actor.userId}`,
        provider: 'mcp',
        tenantId: actor.tenantId,
      }),
      handler: async (args, ctx) => {
        const id = await ctx.mutation('posts:create' as never, args as never)
        return ctx.ok({ id })
      },
    })

    const result = await tool.handler({ title: 'Hello' } as never, {} as never)

    expect(result).toMatchObject({
      structuredContent: {
        ok: true,
        data: {
          id: 'post-1',
        },
      },
    })
    expect(serverConvexMutation).toHaveBeenCalledWith(
      expect.anything(),
      'posts:create',
      {
        title: 'Hello',
        principal: {
          kind: 'agent',
          agentId: 'member-1',
          subject: 'agent:member-1',
          provider: 'mcp',
          tenantId: 'org-1',
        },
      },
      {
        auth: 'trusted',
        principal: {
          kind: 'agent',
          agentId: 'member-1',
          subject: 'agent:member-1',
          provider: 'mcp',
          tenantId: 'org-1',
        },
      },
    )
  })
})

describe('defineMcpApp middleware forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitStore = new ToolRateLimiter()
    useEventMock.mockReturnValue(createEvent())
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'test-trusted-forwarding-key'
  })

  afterEach(() => {
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
  })

  it('uses the projected trusted caller inside middleware query helpers', async () => {
    vi.mocked(serverConvexQuery).mockResolvedValueOnce({ ok: true })

    const mcp = defineMcpApp({
      resolvePrincipal: async () => ({
        kind: 'agent' as const,
        agentId: 'assistant-bot',
        subject: 'agent:assistant-bot',
      }),
      resolveDelegation: async () => ({
        subject: 'user:user_1',
      }),
      callConvex: async (event, caller) =>
        createServerConvexCaller(event, {
          auth: 'trusted',
          principal: caller.principal,
          ...(caller.delegation ? { delegation: caller.delegation } : {}),
        }),
    })

    const tool = mcp.tool({
      schema: emptySchema,
      call: 'runbooks:update' as never,
      operation: 'mutation',
      middleware: async (_args, ctx, next) => {
        await ctx.query('runbooks:getWorkspace' as never, { id: 'runbook_1' } as never)
        return await next()
      },
    })

    await tool.handler({} as never, {} as never)

    expect(serverConvexQuery).toHaveBeenCalledWith(
      expect.anything(),
      'runbooks:getWorkspace',
      {
        id: 'runbook_1',
        principal: {
          kind: 'agent',
          agentId: 'assistant-bot',
          subject: 'agent:assistant-bot',
        },
        delegation: {
          subject: 'user:user_1',
        },
      },
      {
        auth: 'trusted',
        principal: {
          kind: 'agent',
          agentId: 'assistant-bot',
          subject: 'agent:assistant-bot',
        },
        delegation: {
          subject: 'user:user_1',
        },
      },
    )
  })
})

describe('MCP rate-limit integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitStore = new ToolRateLimiter()
    useEventMock.mockReturnValue(
      createEvent({ role: 'member', userId: 'member-1', tenantId: 'org-1' }),
    )
  })

  it('applies shared storage-backed rate limits to defineTool', async () => {
    const tool = defineTool({
      schema: emptySchema,
      name: 'limited-tool',
      auth: 'required',
      rateLimit: { max: 1, window: '1m' },
      rateLimitStore,
      handler: async (_args, ctx) => ctx.ok({ ok: true }),
    })

    const first = await tool.handler({} as never, {} as never)
    const second = await tool.handler({} as never, {} as never)

    expect(first).toMatchObject({
      structuredContent: {
        ok: true,
      },
    })
    expect(second).toMatchObject({
      structuredContent: {
        ok: false,
        error: {
          category: 'cooldown',
        },
      },
    })
  })

  it('applies shared storage-backed rate limits to defineMcpApp tools', async () => {
    const mcp = defineMcpApp({
      rateLimitStore,
      resolvePrincipal: async () => ({
        kind: 'agent' as const,
        agentId: 'assistant-bot',
        subject: 'agent:assistant-bot',
        tenantId: 'org-1',
      }),
      callConvex: async () => ({
        query: async () => ({ ok: true }),
        mutation: async () => ({ ok: true }),
        action: async () => ({ ok: true }),
      }),
    })

    const tool = mcp.tool({
      schema: emptySchema,
      call: 'posts:create' as never,
      operation: 'mutation',
      rateLimit: { max: 1, window: '1m' },
      meta: { name: 'limited-project-tool' },
    })

    const first = await tool.handler({} as never, {} as never)
    const second = await tool.handler({} as never, {} as never)

    expect(first).toMatchObject({
      structuredContent: {
        ok: true,
      },
    })
    expect(second).toMatchObject({
      structuredContent: {
        ok: false,
        error: {
          category: 'cooldown',
        },
      },
    })
  })

  it('refuses production rate-limited tools without an explicit distributed store', () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      expect(() =>
        defineTool({
          schema: emptySchema,
          name: 'production-limited-tool',
          auth: 'required',
          rateLimit: { max: 5, window: '1m' },
          handler: async (_args, ctx) => ctx.ok({ ok: true }),
        }),
      ).toThrow(/rate.?limit.*store|distributed|redis/i)
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })
})

describe('Destructive confirmation payload validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitStore = new ToolRateLimiter()
    useEventMock.mockReturnValue(createEvent())
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'
  })

  afterEach(() => {
    delete process.env.TRELLIS_MCP_CONFIRMATION_KEY
  })

  it('rejects non-object destructive confirm payloads', async () => {
    const operation = defineOperation({
      id: 'delete-post',
      name: 'DeletePost',
      kind: 'destructive',
      args: {},
      guard: { label: 'open', check: () => true } as never,
      preview: async () => ({
        display: { summary: 'Delete post' },
        confirm: 'post-1',
      }),
      handler: async () => ({ ok: true }),
    })
    const preview = previewOf(operation)

    const mcp = defineMcpApp({
      resolvePrincipal: async () => ({
        kind: 'agent' as const,
        agentId: 'assistant-bot',
        subject: 'agent:assistant-bot',
      }),
      callConvex: async () => ({
        query: async () => ({
          display: { summary: 'Delete post' },
          confirm: 'post-1',
        }),
        mutation: async () => ({ ok: true }),
        action: async () => ({ ok: true }),
      }),
    })

    const tool = mcp.tool.fromOperation(operation, {
      execute: operation as never,
      preview: preview as never,
    })

    const result = await tool.handler({} as never, {} as never)

    expect(result).toMatchObject({
      structuredContent: {
        ok: false,
        error: {
          category: 'unknown',
          message: expect.stringContaining('non-empty plain-object confirm payload'),
        },
      },
    })
  })

  it('rejects destructive confirmation when the preview version changes', async () => {
    let previewVersion = 1

    const operation = defineOperation({
      id: 'delete-post',
      name: 'DeletePost',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: { label: 'open', check: () => true } as never,
      preview: async () => ({
        display: { summary: 'Delete post' },
        confirm: { id: 'post-1' },
        version: { rev: previewVersion },
      }),
      handler: async () => ({ ok: true }),
    })
    const preview = previewOf(operation)

    const mcp = defineMcpApp({
      resolvePrincipal: async () => ({
        kind: 'agent' as const,
        agentId: 'assistant-bot',
        subject: 'agent:assistant-bot',
      }),
      callConvex: async () => ({
        query: async () => ({
          display: { summary: 'Delete post' },
          confirm: { id: 'post-1' },
          version: { rev: previewVersion },
        }),
        mutation: async () => ({ ok: true }),
        action: async () => ({ ok: true }),
      }),
    })

    const tool = mcp.tool.fromOperation(operation, {
      execute: operation as never,
      preview: preview as never,
    })

    const previewResult = (await tool.handler({ id: 'post-1' } as never, {} as never)) as {
      structuredContent?: {
        preview?: {
          confirmationToken?: string
        }
      }
    }

    previewVersion = 2

    const confirmed = await tool.handler(
      {
        id: 'post-1',
        _confirmationToken: previewResult.structuredContent?.preview?.confirmationToken,
      } as never,
      {} as never,
    )

    expect(confirmed).toMatchObject({
      structuredContent: {
        ok: false,
        error: {
          category: 'conflict',
          message: expect.stringContaining('Preview version changed before confirmation'),
        },
      },
    })
  })

  it('can keep confirmation token out of transport-confirmed bridge mutations', async () => {
    let executedArgs: Record<string, unknown> | null = null

    const operation = defineOperation({
      id: 'delete-post',
      name: 'DeletePost',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: { label: 'open', check: () => true } as never,
      preview: async () => ({
        display: { summary: 'Delete post' },
        confirm: { id: 'post-1' },
      }),
      handler: async () => ({ ok: true }),
    })
    const preview = previewOf(operation)

    const mcp = defineMcpApp({
      resolvePrincipal: async () => ({
        kind: 'agent' as const,
        agentId: 'assistant-bot',
        subject: 'agent:assistant-bot',
      }),
      callConvex: async () => ({
        query: async () => ({
          display: { summary: 'Delete post' },
          confirm: { id: 'post-1' },
        }),
        mutation: async (_ref, args) => {
          executedArgs = args as Record<string, unknown>
          return { ok: true }
        },
        action: async () => ({ ok: true }),
      }),
    })

    const tool = mcp.tool.fromOperation(operation, {
      execute: operation as never,
      preview: preview as never,
      forwardConfirmationToken: false,
    })

    const previewResult = (await tool.handler({ id: 'post-1' } as never, {} as never)) as {
      structuredContent?: {
        preview?: {
          confirmationToken?: string
        }
      }
    }

    await tool.handler(
      {
        id: 'post-1',
        _confirmationToken: previewResult.structuredContent?.preview?.confirmationToken,
      } as never,
      {} as never,
    )

    expect(executedArgs).toEqual({ id: 'post-1' })
  })

  it('rejects replayed transport confirmation tokens', async () => {
    const operation = defineOperation({
      id: 'delete-post',
      name: 'DeletePost',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: { label: 'open', check: () => true } as never,
      preview: async () => ({
        display: { summary: 'Delete post' },
        confirm: { id: 'post-1' },
      }),
      handler: async () => ({ ok: true }),
    })
    const preview = previewOf(operation)

    const mcp = defineMcpApp({
      resolvePrincipal: async () => ({
        kind: 'agent' as const,
        agentId: 'assistant-bot',
        subject: 'agent:assistant-bot',
      }),
      callConvex: async () => ({
        query: async () => ({
          display: { summary: 'Delete post' },
          confirm: { id: 'post-1' },
        }),
        mutation: async () => ({ ok: true }),
        action: async () => ({ ok: true }),
      }),
    })

    const tool = mcp.tool.fromOperation(operation, {
      execute: operation as never,
      preview: preview as never,
      forwardConfirmationToken: false,
    })

    const previewResult = (await tool.handler({ id: 'post-1' } as never, {} as never)) as {
      structuredContent?: {
        preview?: {
          confirmationToken?: string
        }
      }
    }
    const args = {
      id: 'post-1',
      _confirmationToken: previewResult.structuredContent?.preview?.confirmationToken,
    }

    await tool.handler(args as never, {} as never)
    const replay = await tool.handler(args as never, {} as never)

    expect(replay).toMatchObject({
      structuredContent: {
        ok: false,
        error: {
          category: 'conflict',
          message: expect.stringContaining('already been redeemed'),
        },
      },
    })
  })
})

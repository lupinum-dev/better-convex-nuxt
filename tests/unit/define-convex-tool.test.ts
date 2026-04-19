import { v } from 'convex/values'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineMcpApp } from '../../src/runtime/mcp/define-mcp-app'
import { defineTool } from '../../src/runtime/mcp/define-convex-tool'
import { defineArgs } from '../../src/runtime/schema'
import { createServerConvexCaller } from '../../src/runtime/server'
import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/server/utils/convex'

const { useEventMock } = vi.hoisted(() => ({
  useEventMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useEvent: useEventMock,
}))

vi.mock('../../src/runtime/server/utils/convex', () => ({
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

describe('defineTool visibility and auth parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

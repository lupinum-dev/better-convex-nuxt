import { v } from 'convex/values'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Permission, Resource } from '../../playground/convex/permissions.config'
import { checkPermission } from '../../playground/convex/permissions.config'
import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/server/utils/convex'
import { defineSchema } from '../helpers/v2-schema-experiment'

vi.mock('../../src/runtime/server/utils/convex', () => ({
  serverConvexQuery: vi.fn(),
  serverConvexMutation: vi.fn(),
  serverConvexAction: vi.fn(),
}))

type Actor = {
  role: string
  userId: string
  orgId?: string
}

type ToolEvent = {
  context: {
    mcpAuth?: Actor | null
  }
}

type ExperimentalToolCtx = {
  actor: Actor | null
  can: (permission: Permission, resource?: Resource) => boolean
  query: (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>
  mutation: (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>
  action: (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>
  ok: (data: unknown, summary?: string) => { ok: true; data: unknown; summary?: string }
  error: (code: string, message: string) => { ok: false; error: { code: string; message: string } }
  preview: (
    summary: string,
    extra?: Record<string, unknown>,
  ) => {
    ok: true
    preview: Record<string, unknown>
    awaitingConfirmation: true
  }
  blocked: (summary: string) => {
    ok: true
    preview: Record<string, unknown>
    awaitingConfirmation: true
  }
}

function createEvent(actor: Actor | null): ToolEvent {
  return { context: { mcpAuth: actor } }
}

function createToolFactory() {
  function resolveActor(event: ToolEvent): Actor | null {
    return event.context.mcpAuth ?? null
  }

  function resultOk(data: unknown, summary?: string) {
    return { ok: true as const, data, ...(summary ? { summary } : {}) }
  }

  function resultError(code: string, message: string) {
    return { ok: false as const, error: { code, message } }
  }

  function resultPreview(summary: string, extra?: Record<string, unknown>) {
    return {
      ok: true as const,
      preview: { summary, ...(extra ?? {}) },
      awaitingConfirmation: true as const,
    }
  }

  function injectActor(args: Record<string, unknown> | undefined, actor: Actor | null) {
    if (!actor) return args ?? {}
    return {
      ...(args ?? {}),
      _serviceKey: 'test-service-key',
      _serviceActor: {
        userId: actor.userId,
        role: actor.role,
        ...(actor.orgId ? { orgId: actor.orgId } : {}),
      },
    }
  }

  return function defineTool(options: {
    name: string
    schema: ReturnType<typeof defineSchema>
    auth?: 'required' | 'optional' | 'none'
    require?: Permission
    scoped?: boolean
    destructive?: boolean
    enabled?: (event: ToolEvent) => boolean
    preview?: (
      args: Record<string, unknown>,
      ctx: ExperimentalToolCtx,
    ) => Promise<unknown> | unknown
    handler: (args: Record<string, unknown>, ctx: ExperimentalToolCtx) => Promise<unknown> | unknown
  }) {
    function buildCtx(event: ToolEvent, actor: Actor | null): ExperimentalToolCtx {
      return {
        actor,
        can(permission: Permission, resource?: Resource) {
          if (!actor) return false
          return checkPermission(
            { role: actor.role as never, userId: actor.userId },
            permission,
            resource,
          )
        },
        async query(fn: unknown, args?: Record<string, unknown>) {
          return await serverConvexQuery(
            event as never,
            fn as never,
            (options.scoped ? injectActor(args, actor) : (args ?? {})) as never,
            { auth: 'none' } as never,
          )
        },
        async mutation(fn: unknown, args?: Record<string, unknown>) {
          return await serverConvexMutation(
            event as never,
            fn as never,
            (options.scoped ? injectActor(args, actor) : (args ?? {})) as never,
            { auth: 'none' } as never,
          )
        },
        async action(fn: unknown, args?: Record<string, unknown>) {
          return await serverConvexAction(
            event as never,
            fn as never,
            (options.scoped ? injectActor(args, actor) : (args ?? {})) as never,
            { auth: 'none' } as never,
          )
        },
        ok: resultOk,
        error: resultError,
        preview(summary: string, extra?: Record<string, unknown>) {
          return resultPreview(summary, extra)
        },
        blocked(summary: string) {
          return resultPreview(summary, { blocked: true })
        },
      }
    }

    return {
      isVisible(event: ToolEvent) {
        const actor = resolveActor(event)
        if (options.auth === 'required' && !actor) return false
        if (options.enabled) return options.enabled(event)
        return true
      },

      async invoke(rawArgs: Record<string, unknown>, event: ToolEvent) {
        const actor = options.auth === 'none' ? null : resolveActor(event)
        if (options.auth === 'required' && !actor) {
          return resultError('auth', 'Authentication required.')
        }

        if (options.require) {
          if (!actor) return resultError('auth', 'Authentication required.')
          const allowed = checkPermission(
            { role: actor.role as never, userId: actor.userId },
            options.require,
          )
          if (!allowed) {
            return resultError('auth', `Permission denied: requires '${options.require}'.`)
          }
        }

        const { _confirmed, ...args } = rawArgs
        const ctx = buildCtx(event, actor)

        if (options.destructive && _confirmed !== true) {
          if (options.preview) {
            return await options.preview(args, ctx)
          }
          return resultError('confirmation_required', 'Confirmation required.')
        }

        return await options.handler(args, ctx)
      },
    }
  }
}

describe('v2 MCP tool experiment', () => {
  beforeEach(() => {
    vi.mocked(serverConvexQuery).mockReset()
    vi.mocked(serverConvexMutation).mockReset()
    vi.mocked(serverConvexAction).mockReset()
  })

  it('hides auth-required tools from anonymous callers', () => {
    const defineTool = createToolFactory()
    const tool = defineTool({
      name: 'create-post',
      schema: defineSchema({ args: { title: v.string() } }),
      auth: 'required',
      handler: async (_args, ctx) => ctx.ok({ ok: true }),
    })

    expect(tool.isVisible(createEvent(null))).toBe(false)
    expect(tool.isVisible(createEvent({ role: 'member', userId: 'user_1', orgId: 'org_1' }))).toBe(
      true,
    )
  })

  it('runs permission checks before the handler', async () => {
    const defineTool = createToolFactory()
    const handler = vi.fn(async (_args: Record<string, unknown>, ctx: ExperimentalToolCtx) =>
      ctx.ok({ ok: true }),
    )
    const tool = defineTool({
      name: 'create-post',
      schema: defineSchema({ args: { title: v.string() } }),
      auth: 'required',
      require: 'post.create',
      handler,
    })

    const denied = await tool.invoke(
      { title: 'Hello' },
      createEvent({ role: 'viewer', userId: 'user_1', orgId: 'org_1' }),
    )
    expect(denied).toEqual({
      ok: false,
      error: { code: 'auth', message: "Permission denied: requires 'post.create'." },
    })
    expect(handler).not.toHaveBeenCalled()

    const allowed = await tool.invoke(
      { title: 'Hello' },
      createEvent({ role: 'member', userId: 'user_1', orgId: 'org_1' }),
    )
    expect(allowed).toEqual({ ok: true, data: { ok: true } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('injects service auth into scoped calls and leaves public calls untouched', async () => {
    vi.mocked(serverConvexMutation).mockResolvedValue({ id: 'post_1' } as never)

    const defineTool = createToolFactory()
    const scopedTool = defineTool({
      name: 'create-post',
      schema: defineSchema({ args: { title: v.string() } }),
      auth: 'required',
      scoped: true,
      handler: async (args, ctx) => {
        await ctx.mutation('posts.create', args)
        return ctx.ok({ created: true })
      },
    })

    await scopedTool.invoke(
      { title: 'Hello' },
      createEvent({ role: 'member', userId: 'user_1', orgId: 'org_1' }),
    )

    expect(serverConvexMutation).toHaveBeenCalledWith(
      expect.anything(),
      'posts.create',
      {
        title: 'Hello',
        _serviceKey: 'test-service-key',
        _serviceActor: {
          userId: 'user_1',
          role: 'member',
          orgId: 'org_1',
        },
      },
      { auth: 'none' },
    )

    vi.mocked(serverConvexMutation).mockReset()

    const publicTool = defineTool({
      name: 'list-posts',
      schema: defineSchema({ args: { limit: v.optional(v.float64()) } }),
      auth: 'none',
      handler: async (args, ctx) => {
        await ctx.mutation('posts.list', args)
        return ctx.ok({ listed: true })
      },
    })

    await publicTool.invoke({ limit: 10 }, createEvent(null))

    expect(serverConvexMutation).toHaveBeenCalledWith(
      expect.anything(),
      'posts.list',
      { limit: 10 },
      { auth: 'none' },
    )
  })

  it('supports destructive preview and confirmation with one ctx shape', async () => {
    const defineTool = createToolFactory()
    const handler = vi.fn(async (args: Record<string, unknown>, ctx: ExperimentalToolCtx) => {
      return ctx.ok({ deleted: true, id: args.id })
    })

    const tool = defineTool({
      name: 'delete-post',
      schema: defineSchema({ args: { id: v.string() } }),
      auth: 'required',
      destructive: true,
      preview: async (args, ctx) =>
        ctx.preview(`Will delete ${args.id}`, { affects: { posts: 1 } }),
      handler,
    })

    const first = await tool.invoke(
      { id: 'post_1' },
      createEvent({ role: 'admin', userId: 'user_1', orgId: 'org_1' }),
    )
    expect(first).toEqual({
      ok: true,
      preview: { summary: 'Will delete post_1', affects: { posts: 1 } },
      awaitingConfirmation: true,
    })
    expect(handler).not.toHaveBeenCalled()

    const second = await tool.invoke(
      { id: 'post_1', _confirmed: true },
      createEvent({ role: 'admin', userId: 'user_1', orgId: 'org_1' }),
    )
    expect(second).toEqual({
      ok: true,
      data: { deleted: true, id: 'post_1' },
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('exposes can, ok, error, and blocked helpers on the same ctx object', async () => {
    const defineTool = createToolFactory()
    const tool = defineTool({
      name: 'update-post',
      schema: defineSchema({ args: { id: v.string() } }),
      auth: 'required',
      handler: async (_args, ctx) => {
        if (!ctx.can('post.update', { ownerId: 'user_2' })) {
          return ctx.blocked('Ownership mismatch')
        }
        return ctx.error('unexpected', 'Should not reach success path')
      },
    })

    const result = await tool.invoke(
      { id: 'post_1' },
      createEvent({ role: 'member', userId: 'user_1', orgId: 'org_1' }),
    )

    expect(result).toEqual({
      ok: true,
      preview: { summary: 'Ownership mismatch', blocked: true },
      awaitingConfirmation: true,
    })
  })
})

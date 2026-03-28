import type { McpRequestExtra } from '@nuxtjs/mcp-toolkit/server'
import { v } from 'convex/values'
import { useEvent } from 'h3'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'

import { createConvexTools, defineConvexTool } from '../../src/runtime/mcp/define-convex-tool'
import { globalRateLimiter } from '../../src/runtime/mcp/rate-limiter'
import { wrapError } from '../../src/runtime/mcp/result-envelope'
import { ConvexCallError } from '../../src/runtime/utils/call-result'
import { defineConvexSchema } from '../../src/runtime/utils/define-convex-schema'

// ============================================================================
// Mock h3 at top level (Vitest hoists vi.mock calls)
// ============================================================================

vi.mock('h3', () => ({
  useEvent: vi.fn(),
}))

const mockExtra = {} as McpRequestExtra

// ============================================================================
// Helpers
// ============================================================================

function getStructured(result: unknown): Record<string, unknown> {
  return (result as any).structuredContent
}

function getContent(result: unknown): string {
  return (result as any).content?.[0]?.text
}

function mockAuth(auth: { role: string; userId: string } | null) {
  vi.mocked(useEvent).mockReturnValue({
    context: { mcpAuth: auth },
  } as any)
}

// ============================================================================
// Tests
// ============================================================================

describe('defineConvexTool', () => {
  beforeEach(() => {
    globalRateLimiter.reset()
    vi.mocked(useEvent).mockReset()
  })

  // ── Structured envelope ─────────────────────────────────────────────────

  describe('structured envelope', () => {
    it('wraps plain handler return in ok: true envelope', async () => {
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        handler: (args) => ({ id: 'abc', title: args.title }),
      })

      const result = await tool.handler!({ title: 'Hello' }, mockExtra)
      const structured = getStructured(result)

      expect(structured).toEqual({
        ok: true,
        data: { id: 'abc', title: 'Hello' },
      })
    })

    it('uses withSummary for explicit text content', async () => {
      const { withSummary } = await import('../../src/runtime/mcp/result-envelope')
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        handler: (args) => withSummary({ id: 'abc' }, `Created: ${args.title}`),
      })

      const result = await tool.handler!({ title: 'Hello' }, mockExtra)

      expect(getContent(result)).toBe('Created: Hello')
      expect(getStructured(result)).toEqual({
        ok: true,
        data: { id: 'abc' },
      })
    })

    it('does not split domain objects with data+summary fields', async () => {
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        handler: () => ({ data: [1, 2], summary: 'report', total: 5 }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)

      // Should NOT split — domain object stays intact as data
      expect(getStructured(result)).toEqual({
        ok: true,
        data: { data: [1, 2], summary: 'report', total: 5 },
      })
    })
  })

  // ── Error envelope ──────────────────────────────────────────────────────

  describe('error envelope', () => {
    it('wraps thrown ConvexCallError with structured error', async () => {
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        handler: () => {
          throw new ConvexCallError('Unauthorized', { category: 'auth' })
        },
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      const structured = getStructured(result)

      expect(structured).toEqual({
        ok: false,
        error: {
          category: 'auth',
          message: 'Unauthorized',
          retryable: true,
        },
      })
      expect((result as any).isError).toBe(true)
    })

    it('cleans verbose error messages', async () => {
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        handler: () => {
          throw new ConvexCallError(
            '[serverConvexMutation] Request failed for posts:create via http://localhost/api/mutation. Server Error\nUncaught Error: Not allowed',
            { category: 'auth' },
          )
        },
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getContent(result)).toBe('Not allowed')
    })

    it('infers category from error message when unknown', async () => {
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        handler: () => {
          throw new Error('Too many requests')
        },
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: { category: 'rate_limit' },
      })
    })
  })

  // ── Operation annotations ───────────────────────────────────────────────

  describe('annotations', () => {
    it('derives readOnly annotations from operation: query', () => {
      const schema = defineConvexSchema({}, { description: 'List items' })
      const tool = defineConvexTool({
        schema,
        operation: 'query',
        handler: () => [],
      })

      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      })
    })

    it('derives mutation annotations with destructive flag', () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        handler: () => ({ deleted: true }),
      })

      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      })
    })

    it('derives action annotations with openWorldHint', () => {
      const schema = defineConvexSchema({ query: v.string() })
      const tool = defineConvexTool({
        schema,
        operation: 'action',
        handler: () => ({}),
      })

      expect(tool.annotations).toMatchObject({
        openWorldHint: true,
        readOnlyHint: false,
      })
    })

    it('allows annotation overrides', () => {
      const schema = defineConvexSchema({}, { description: 'test' })
      const tool = defineConvexTool({
        schema,
        operation: 'query',
        annotations: { idempotentHint: false },
        handler: () => [],
      })

      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        idempotentHint: false,
      })
    })
  })

  // ── Description enrichment ──────────────────────────────────────────────

  describe('description', () => {
    it('defaults description from schema meta', () => {
      const schema = defineConvexSchema({}, { description: 'List all notes' })
      const tool = defineConvexTool({ schema, handler: () => [] })
      expect(tool.description).toBe('List all notes')
    })

    it('appends auth notice when auth is required', () => {
      const schema = defineConvexSchema({}, { description: 'Create a post' })
      const tool = defineConvexTool({
        schema,
        auth: 'required',
        handler: () => ({}),
      })
      expect(tool.description).toBe('Create a post\n\nRequires authentication.')
    })

    it('does not append auth notice when auth is none', () => {
      const schema = defineConvexSchema({}, { description: 'Public tool' })
      const tool = defineConvexTool({
        schema,
        handler: () => ({}),
      })
      expect(tool.description).toBe('Public tool')
    })
  })

  // ── Enhanced field descriptions ─────────────────────────────────────────

  describe('enhanced field descriptions', () => {
    it('combines description, examples, enum, and defaultHint', () => {
      const schema = defineConvexSchema(
        { format: v.string(), title: v.string() },
        {
          fields: {
            format: {
              description: 'Content format',
              enum: ['markdown', 'html'],
              defaultHint: 'markdown',
            },
            title: {
              description: 'Post title',
              examples: ['My First Post', 'Weekly Update'],
            },
          },
        },
      )

      const tool = defineConvexTool({ schema, handler: () => ({}) })

      expect(tool.inputSchema!.format.description).toBe(
        'Content format. One of: markdown, html. Default: "markdown"',
      )
      expect(tool.inputSchema!.title.description).toBe(
        'Post title. (e.g. "My First Post", "Weekly Update")',
      )
    })
  })

  // ── Input examples ──────────────────────────────────────────────────────

  describe('input examples', () => {
    it('auto-generates from field examples', () => {
      const schema = defineConvexSchema(
        { title: v.string(), content: v.string() },
        {
          fields: {
            title: { examples: ['My First Post'] },
            content: { examples: ['# Hello'] },
          },
        },
      )

      const tool = defineConvexTool({ schema, handler: () => ({}) })

      expect((tool as any)._meta?.inputExamples ?? tool.inputExamples).toEqual([
        { title: 'My First Post', content: '# Hello' },
      ])
    })

    it('uses explicit inputExamples when provided', () => {
      const schema = defineConvexSchema(
        { title: v.string() },
        { fields: { title: { examples: ['Auto'] } } },
      )

      const tool = defineConvexTool({
        schema,
        inputExamples: [{ title: 'Explicit' }],
        handler: () => ({}),
      })

      expect((tool as any)._meta?.inputExamples ?? tool.inputExamples).toEqual([
        { title: 'Explicit' },
      ])
    })
  })

  // ── Auth pipeline ──────────────────────────────────────────────────────

  describe('auth pipeline', () => {
    it('returns auth error when auth: required and no mcpAuth', async () => {
      mockAuth(null)
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        auth: 'required',
        handler: () => ({ ok: true }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: { category: 'auth', message: 'Authentication required.' },
      })
    })

    it('runs handler when auth: required and mcpAuth is present', async () => {
      mockAuth({ role: 'admin', userId: 'user-1' })
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        auth: 'required',
        handler: (args) => ({ title: args.title }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toEqual({
        ok: true,
        data: { title: 'test' },
      })
    })

    it('runs handler when auth: optional and no mcpAuth', async () => {
      mockAuth(null)
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        auth: 'optional',
        handler: () => ({ ok: true }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toMatchObject({ ok: true })
    })
  })

  // ── Permission pipeline ─────────────────────────────────────────────────

  describe('permission pipeline', () => {
    const checkPermission = (
      ctx: { role: string; userId: string } | null,
      permission: string,
    ): boolean => {
      if (!ctx) return false
      if (permission === 'post.create') return ctx.role === 'editor' || ctx.role === 'admin'
      return ctx.role === 'admin'
    }

    it('denies when permission check fails', async () => {
      mockAuth({ role: 'viewer', userId: 'user-1' })
      const { defineConvexTool: typedDefine } = createConvexTools({ checkPermission })
      const schema = defineConvexSchema({ title: v.string() })
      const tool = typedDefine({
        schema,
        auth: 'required',
        require: 'post.create',
        handler: () => ({ ok: true }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: {
          category: 'auth',
          message: expect.stringContaining('Permission denied'),
        },
      })
    })

    it('allows when permission check passes', async () => {
      mockAuth({ role: 'editor', userId: 'user-1' })
      const { defineConvexTool: typedDefine } = createConvexTools({ checkPermission })
      const schema = defineConvexSchema({ title: v.string() })
      const tool = typedDefine({
        schema,
        auth: 'required',
        require: 'post.create',
        handler: () => ({ created: true }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toEqual({
        ok: true,
        data: { created: true },
      })
    })

    it('denies when auth: optional + require and mcpAuth is null', async () => {
      mockAuth(null)
      const { defineConvexTool: typedDefine } = createConvexTools({ checkPermission })
      const schema = defineConvexSchema({ title: v.string() })
      const tool = typedDefine({
        schema,
        auth: 'optional',
        require: 'post.create',
        handler: () => ({ ok: true }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: { category: 'auth', message: 'Authentication required.' },
      })
    })
  })

  // ── Destructive confirmation ────────────────────────────────────────────

  describe('destructive confirmation', () => {
    it('injects _confirmed into input schema for destructive tools', () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        handler: () => ({ deleted: true }),
      })

      const parser = z.object(tool.inputSchema as any)
      expect(() => parser.parse({ id: 'abc', _confirmed: true })).not.toThrow()
      expect(() => parser.parse({ id: 'abc' })).not.toThrow() // _confirmed is optional
    })

    it('returns confirmation_required without _confirmed', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        handler: () => ({ deleted: true }),
      })

      const result = await tool.handler!({ id: 'abc' }, mockExtra)
      const structured = getStructured(result)

      expect(structured).toEqual({
        ok: false,
        error: {
          category: 'confirmation_required',
          message: 'This action is destructive. Call again with _confirmed: true to proceed.',
          retryable: true,
        },
      })
    })

    it('runs handler with _confirmed: true', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        handler: () => ({ deleted: true }),
      })

      const result = await tool.handler!({ id: 'abc', _confirmed: true }, mockExtra)
      expect(getStructured(result)).toEqual({
        ok: true,
        data: { deleted: true },
      })
    })

    it('strips _confirmed from handler args', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      let receivedArgs: Record<string, unknown> | null = null
      const tool = defineConvexTool({
        schema,
        destructive: true,
        handler: (args) => {
          receivedArgs = args as any
          return { ok: true }
        },
      })

      await tool.handler!({ id: 'abc', _confirmed: true }, mockExtra)
      expect(receivedArgs).toEqual({ id: 'abc' })
    })
  })

  // ── Preview flow ────────────────────────────────────────────────────────

  describe('preview', () => {
    beforeEach(() => {
      mockAuth({ role: 'admin', userId: 'user-1' })
    })

    it('returns preview on first call, handler on confirmed call', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        preview: () => 'Will delete the post',
        handler: () => ({ deleted: true }),
      })

      // First call — preview
      const previewResult = await tool.handler!({ id: 'abc' }, mockExtra)
      expect(getStructured(previewResult)).toEqual({
        ok: true,
        preview: { summary: 'Will delete the post' },
        awaitingConfirmation: true,
      })

      // Second call — confirmed
      const confirmResult = await tool.handler!({ id: 'abc', _confirmed: true }, mockExtra)
      expect(getStructured(confirmResult)).toEqual({
        ok: true,
        data: { deleted: true },
      })
    })

    it('returns rich preview with affects and warn', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        preview: () => ({
          summary: 'Will delete "My Post"',
          warn: '3 comments will also be deleted',
          affects: { posts: 1, comments: 3 },
        }),
        handler: () => ({ deleted: true }),
      })

      const result = await tool.handler!({ id: 'abc' }, mockExtra)
      expect(getStructured(result)).toEqual({
        ok: true,
        preview: {
          summary: 'Will delete "My Post"',
          warn: '3 comments will also be deleted',
          affects: { posts: 1, comments: 3 },
        },
        awaitingConfirmation: true,
      })
    })

    it('wraps preview errors in structured envelope', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        preview: () => { throw new Error('Preview failed') },
        handler: () => ({ deleted: true }),
      })

      const result = await tool.handler!({ id: 'abc' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: { message: 'Preview failed' },
      })
      expect((result as any).isError).toBe(true)
    })
  })

  // ── Max items ───────────────────────────────────────────────────────────

  describe('maxItems', () => {
    it('blocks when array exceeds limit', async () => {
      const schema = defineConvexSchema({ ids: v.array(v.string()) })
      const tool = defineConvexTool({
        schema,
        maxItems: { field: 'ids', limit: 3 },
        handler: () => ({ deleted: true }),
      })

      const result = await tool.handler!(
        { ids: ['1', '2', '3', '4'], _confirmed: true },
        mockExtra,
      )
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: {
          category: 'scope_exceeded',
          message: 'Cannot process more than 3 items at once. Received 4.',
        },
      })
    })

    it('allows when array is within limit', async () => {
      const schema = defineConvexSchema({ ids: v.array(v.string()) })
      const tool = defineConvexTool({
        schema,
        maxItems: { field: 'ids', limit: 3 },
        handler: () => ({ processed: true }),
      })

      const result = await tool.handler!({ ids: ['1', '2'] }, mockExtra)
      expect(getStructured(result)).toMatchObject({ ok: true })
    })
  })

  // ── Rate limit ──────────────────────────────────────────────────────────

  describe('rateLimit', () => {
    it('blocks after exceeding rate limit', async () => {
      const schema = defineConvexSchema({ title: v.string() })
      const tool = defineConvexTool({
        schema,
        name: 'rate-test-tool',
        rateLimit: { max: 2, window: '1m' },
        handler: () => ({ ok: true }),
      })

      // First two calls succeed
      let result = await tool.handler!({ title: 'a' }, mockExtra)
      expect(getStructured(result)).toMatchObject({ ok: true })
      result = await tool.handler!({ title: 'b' }, mockExtra)
      expect(getStructured(result)).toMatchObject({ ok: true })

      // Third call is blocked
      result = await tool.handler!({ title: 'c' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: {
          category: 'cooldown',
          retryable: true,
        },
      })
      expect(getContent(result)).toMatch(/Rate limit exceeded/)
    })
  })

  // ── Middleware ───────────────────────────────────────────────────────────

  describe('middleware', () => {
    beforeEach(() => {
      mockAuth({ role: 'viewer', userId: 'user-1' })
    })

    it('can block execution using wrapError', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        auth: 'optional',
        middleware: async (_args, _ctx, _next) => {
          return wrapError('auth', 'Custom check failed')
        },
        handler: () => ({ ok: true }),
      })

      const result = await tool.handler!({ id: 'abc' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: {
          category: 'auth',
          message: 'Custom check failed',
        },
      })
    })

    it('passes through to handler via next()', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        auth: 'optional',
        middleware: async (_args, _ctx, next) => next(),
        handler: () => ({ done: true }),
      })

      const result = await tool.handler!({ id: 'abc' }, mockExtra)
      expect(getStructured(result)).toEqual({ ok: true, data: { done: true } })
    })

    it('returns server error when middleware forgets to return next()', async () => {
      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        auth: 'optional',
        middleware: async (_args, _ctx, next) => {
          await next()
          // Forgot to return!
        },
        handler: () => ({ done: true }),
      })

      const result = await tool.handler!({ id: 'abc' }, mockExtra)
      expect(getStructured(result)).toMatchObject({
        ok: false,
        error: {
          category: 'server',
          message: expect.stringContaining('Middleware must return a result'),
        },
      })
    })

    it('ctx.can() returns correct permission results', async () => {
      mockAuth({ role: 'editor', userId: 'user-1' })
      const checkPermission = (
        ctx: { role: string; userId: string } | null,
        permission: string,
      ): boolean => {
        if (!ctx) return false
        return permission === 'post.create' && (ctx.role === 'editor' || ctx.role === 'admin')
      }
      const { defineConvexTool: typedDefine } = createConvexTools({ checkPermission })
      const schema = defineConvexSchema({ id: v.string() })
      let canCreate = false
      let canDelete = false
      const tool = typedDefine({
        schema,
        auth: 'required',
        middleware: async (_args, ctx, next) => {
          canCreate = ctx.can('post.create')
          canDelete = ctx.can('post.delete')
          return next()
        },
        handler: () => ({ ok: true }),
      })

      await tool.handler!({ id: 'abc' }, mockExtra)
      expect(canCreate).toBe(true)
      expect(canDelete).toBe(false)
    })
  })

  // ── Definition-time validations ─────────────────────────────────────────

  describe('definition-time validations', () => {
    it('throws when require is used without factory or _checkPermission', () => {
      const schema = defineConvexSchema({ title: v.string() })
      expect(() =>
        defineConvexTool({
          schema,
          require: 'post.create',
          handler: () => ({}),
        }),
      ).toThrow('require')
    })

    it('throws when require is used with auth: none', () => {
      const checkPermission = () => true
      const { defineConvexTool: typedDefine } = createConvexTools({ checkPermission })
      const schema = defineConvexSchema({ title: v.string() })
      expect(() =>
        typedDefine({
          schema,
          auth: 'none',
          require: 'post.create',
          handler: () => ({}),
        }),
      ).toThrow('require')
    })

    it('throws when preview is used without destructive', () => {
      const schema = defineConvexSchema({ id: v.string() })
      expect(() =>
        defineConvexTool({
          schema,
          preview: () => 'test',
          handler: () => ({}),
        }),
      ).toThrow('preview')
    })

    it('throws when rateLimit is used without name', () => {
      const schema = defineConvexSchema({ title: v.string() })
      expect(() =>
        defineConvexTool({
          schema,
          rateLimit: { max: 5, window: '1m' },
          handler: () => ({}),
        }),
      ).toThrow('rateLimit')
    })

    it('throws when maxItems.field is not in schema', () => {
      const schema = defineConvexSchema({ ids: v.array(v.string()) })
      expect(() =>
        defineConvexTool({
          schema,
          maxItems: { field: 'nonexistent' as any, limit: 5 },
          handler: () => ({}),
        }),
      ).toThrow('maxItems.field')
    })
  })

  // ── Custom resolveAuth ──────────────────────────────────────────────────

  describe('custom resolveAuth', () => {
    it('uses custom resolveAuth from factory', async () => {
      // Mock useEvent to return a bare event — resolveAuth will override
      vi.mocked(useEvent).mockReturnValue({
        context: { customSession: { id: 'custom-user', level: 'superadmin' } },
      } as any)

      const checkPermission = () => true
      const { defineConvexTool: typedDefine } = createConvexTools({
        checkPermission,
        resolveAuth: (event) => {
          const session = (event as any).context.customSession
          if (!session) return null
          return { role: session.level, userId: session.id }
        },
      })

      const schema = defineConvexSchema({ title: v.string() })
      const tool = typedDefine({
        schema,
        auth: 'required',
        handler: () => ({ ok: true }),
      })

      const result = await tool.handler!({ title: 'test' }, mockExtra)
      expect(getStructured(result)).toMatchObject({ ok: true })
    })
  })

  // ── Preview without auth ──────────────────────────────────────────────

  describe('preview without auth', () => {
    it('returns preview when auth: none + destructive + preview', async () => {
      // needsEvent should be true due to destructive + preview, even without auth
      vi.mocked(useEvent).mockReturnValue({
        context: {},
      } as any)

      const schema = defineConvexSchema({ id: v.string() })
      const tool = defineConvexTool({
        schema,
        destructive: true,
        preview: () => 'Will delete item',
        handler: () => ({ deleted: true }),
      })

      const result = await tool.handler!({ id: 'abc' }, mockExtra)
      expect(getStructured(result)).toEqual({
        ok: true,
        preview: { summary: 'Will delete item' },
        awaitingConfirmation: true,
      })
    })
  })

  // ── createConvexTools factory ───────────────────────────────────────────

  describe('createConvexTools', () => {
    it('creates typed defineConvexTool with permission checking', () => {
      type Permission = 'post.create' | 'post.delete'
      const checkPermission = (
        ctx: { role: string; userId: string } | null,
        permission: Permission,
      ): boolean => {
        if (!ctx) return false
        if (permission === 'post.create') return ctx.role === 'editor' || ctx.role === 'admin'
        return ctx.role === 'admin'
      }

      const { defineConvexTool: typedDefine } = createConvexTools<Permission>({
        checkPermission,
      })

      const schema = defineConvexSchema({ title: v.string() }, { description: 'Create post' })

      // This should compile — 'post.create' is a valid Permission
      const tool = typedDefine({
        schema,
        auth: 'required',
        require: 'post.create',
        handler: () => ({ id: 'abc' }),
      })

      expect(tool.description).toBe('Create post\n\nRequires authentication.')
    })
  })

  // ── Backward compat — old defineConvexMcpTool still works ───────────────

  describe('backward compatibility', () => {
    it('defineConvexMcpTool is still exported from index', async () => {
      const { defineConvexMcpTool } = await import('../../src/runtime/mcp/index')
      expect(defineConvexMcpTool).toBeDefined()
      expect(typeof defineConvexMcpTool).toBe('function')
    })
  })
})

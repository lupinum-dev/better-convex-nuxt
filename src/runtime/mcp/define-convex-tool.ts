import type { H3Event } from 'h3'
import type {
  McpToolAnnotations,
  McpToolCallbackResult,
  McpToolDefinition,
} from '@nuxtjs/mcp-toolkit/server'
import type { ShapeOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { convexToZodFields } from 'convex-helpers/server/zod4'
import type { ZodValidatorFromConvex } from 'convex-helpers/server/zod4'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { PropertyValidators } from 'convex/values'
import { z } from 'zod'
import type { ZodRawShape, ZodTypeAny } from 'zod'

import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../server/utils/convex'
import { toConvexError } from '../utils/call-result'
import type { SchemaFieldMeta } from '../utils/define-convex-schema'
import type { ConvexToolOperation } from '../utils/types'

import { cleanErrorMessage, inferCategoryFromMessage } from './error-helpers'
import { globalRateLimiter, parseWindowString } from './rate-limiter'
import {
  withSummary,
  wrapError,
  wrapPreview,
  wrapSuccess,
} from './result-envelope'
import type {
  AnyConvexSchema,
  ConvexToolCallFns,
  ConvexToolHandlerCtx,
  ConvexToolMiddlewareCtx,
  DefineConvexToolOptions,
  InferSchemaData,
  InferSchemaValidators,
  McpAuthIdentity,
  PreviewResult,
} from './types'

// ============================================================================
// Internal options (adds factory-injected fields — not part of public API)
// ============================================================================

interface DefineConvexToolFullOptions<
  S extends AnyConvexSchema,
  TRole extends string = string,
> extends DefineConvexToolOptions<S, TRole> {
}

// ============================================================================
// Input schema types
// ============================================================================

type ConvexMcpInputSchema<V extends PropertyValidators> = {
  [K in keyof V]: ZodValidatorFromConvex<V[K]>
}

type ConvexToolInputSchema<S extends AnyConvexSchema> =
  ConvexMcpInputSchema<InferSchemaValidators<S>> & { _confirmed?: ZodTypeAny }

type ConvexToolHandlerArgs<S extends AnyConvexSchema> =
  ShapeOutput<ConvexToolInputSchema<S>>

type ConvexToolGeneratedExamples<V extends PropertyValidators> =
  Partial<ShapeOutput<ConvexMcpInputSchema<V>>>[]

interface NormalizedToolArgs<S extends AnyConvexSchema> {
  clean: InferSchemaData<S>
  confirmed: boolean
}

// ============================================================================
// Convex → Zod for MCP (JSON-Schema-safe)
//
// convex-helpers converts v.id() to z.custom(), which can't serialize to
// JSON Schema. We patch those fields to z.string() in a single pass.
// ============================================================================

/**
 * Check if a Convex validator contains v.id() anywhere in its tree.
 * Returns a JSON-Schema-safe Zod replacement if so, or null if no fixup needed.
 */
function convexIdToZod(cv: unknown): ZodTypeAny | null {
  const v = cv as { kind?: string; tableName?: string; element?: unknown; inner?: unknown; members?: unknown[] }
  if (!v || typeof v !== 'object' || !v.kind) return null

  // Direct: v.id('table')
  if (v.kind === 'id' && v.tableName) {
    return z.string().describe(`Convex ID for "${v.tableName}" table`)
  }

  // Wrapper: v.array(v.id('table'))
  if (v.kind === 'array' && v.element) {
    const inner = convexIdToZod(v.element)
    if (inner) return z.array(inner)
  }

  // Wrapper: v.optional(v.id('table'))
  if (v.kind === 'optional' && v.inner) {
    const inner = convexIdToZod(v.inner)
    if (inner) return inner.optional()
  }

  // Fail-fast: v.union() containing v.id() (at any depth) can't be auto-converted
  if (v.kind === 'union' && Array.isArray(v.members)) {
    const hasId = v.members.some(m => convexIdToZod(m) !== null)
    if (hasId) {
      throw new Error(
        `defineTool: v.union() containing v.id() cannot be auto-converted to JSON Schema. `
        + `Use a plain v.string() instead, or provide the field description via schema metadata.`,
      )
    }
  }

  return null
}

function convexToMcpZodFields<V extends PropertyValidators>(
  validators: V,
): ConvexMcpInputSchema<V> {
  const shape = convexToZodFields(validators)
  for (const key of Object.keys(validators) as (keyof V & string)[]) {
    let replacement = convexIdToZod(validators[key])
    if (replacement) {
      // Convex collapses v.optional(v.id()) into {kind:'id', isOptional:'optional'}
      // so convexIdToZod returns a required z.string() — restore optionality here
      const cv = validators[key] as { isOptional?: string }
      if (cv.isOptional === 'optional') {
        replacement = replacement.optional()
      }
      shape[key] = replacement as ConvexMcpInputSchema<V>[keyof V]
    }
  }
  return shape
}

// ============================================================================
// Annotation derivation
// ============================================================================

function deriveAnnotations(
  operation: ConvexToolOperation,
  destructive: boolean | undefined,
  overrides?: Partial<McpToolAnnotations>,
): McpToolAnnotations {
  const base: McpToolAnnotations = (() => {
    switch (operation) {
      case 'query':
        return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      case 'action':
        return { readOnlyHint: false, destructiveHint: destructive ?? false, idempotentHint: false, openWorldHint: true }
      case 'mutation':
      default:
        return { readOnlyHint: false, destructiveHint: destructive ?? false, idempotentHint: false, openWorldHint: false }
    }
  })()

  return overrides ? { ...base, ...overrides } : base
}

// ============================================================================
// Enhanced field descriptions
// ============================================================================

function buildFieldDescription(meta: SchemaFieldMeta): string | undefined {
  const parts: string[] = []

  if (meta.description) parts.push(meta.description)

  if (meta.examples?.length) {
    const exampleStr = meta.examples
      .slice(0, 3)
      .map(e => JSON.stringify(e))
      .join(', ')
    parts.push(`(e.g. ${exampleStr})`)
  }

  if (meta.enum?.length) {
    parts.push(`One of: ${meta.enum.join(', ')}`)
  }

  if (meta.defaultHint !== undefined) {
    parts.push(`Default: ${JSON.stringify(meta.defaultHint)}`)
  }

  return parts.length > 0 ? parts.join('. ') : undefined
}

function applyEnhancedFieldDescriptions<V extends PropertyValidators>(
  shape: ConvexMcpInputSchema<V>,
  fields: { [K in keyof V]: SchemaFieldMeta } | undefined,
): ConvexMcpInputSchema<V> {
  if (!fields) return shape

  const describedShape = { ...shape } as ConvexMcpInputSchema<V>

  for (const [fieldName, fieldSchema] of Object.entries(shape) as [keyof V, ZodTypeAny][]) {
    const meta = fields[fieldName]
    if (!meta) continue
    const description = buildFieldDescription(meta)
    if (description) {
      describedShape[fieldName] = fieldSchema.describe(
        description,
      ) as ConvexMcpInputSchema<V>[keyof V]
    }
  }

  return describedShape
}

// ============================================================================
// Input examples auto-generation
// ============================================================================

function buildInputExamples<V extends PropertyValidators>(
  fields: { [K in keyof V]: SchemaFieldMeta } | undefined,
): ConvexToolGeneratedExamples<V> | undefined {
  if (!fields) return undefined

  const example: Partial<ShapeOutput<ConvexMcpInputSchema<V>>> = {}
  let hasAny = false

  for (const [key, meta] of Object.entries(fields) as [string, SchemaFieldMeta][]) {
    if (meta.examples?.length) {
      example[key as keyof typeof example] = meta.examples[0] as typeof example[keyof typeof example]
      hasAny = true
    }
  }

  return hasAny ? [example] : undefined
}

function toToolInputExamples<S extends AnyConvexSchema>(
  examples:
    | Partial<InferSchemaData<S>>[]
    | Partial<Record<string, unknown>>[]
    | undefined,
): McpToolDefinition<ConvexToolInputSchema<S>, ZodRawShape>['inputExamples'] {
  return examples as McpToolDefinition<ConvexToolInputSchema<S>, ZodRawShape>['inputExamples']
}

function toToolHandler<S extends AnyConvexSchema>(
  handler: (
    args: ConvexToolHandlerArgs<S>,
  ) => Promise<McpToolCallbackResult>,
): McpToolDefinition<ConvexToolInputSchema<S>, ZodRawShape>['handler'] {
  return handler as unknown as McpToolDefinition<ConvexToolInputSchema<S>, ZodRawShape>['handler']
}

function normalizeToolArgs<S extends AnyConvexSchema>(
  args: ConvexToolHandlerArgs<S>,
): NormalizedToolArgs<S> {
  const { _confirmed, ...cleanArgs } = args

  return {
    clean: cleanArgs as InferSchemaData<S>,
    confirmed: _confirmed === true,
  }
}

function injectServiceActorArgs(
  args: Record<string, unknown> | undefined,
  actor: McpAuthIdentity | null,
): Record<string, unknown> {
  if (!actor) {
    return args ?? {}
  }

  const serviceKey = process.env.CONVEX_SERVICE_KEY?.trim()
  if (!serviceKey) {
    throw new Error(
      'CONVEX_SERVICE_KEY is required for authenticated MCP ctx.query()/mutation()/action() calls.',
    )
  }

  return {
    ...(args ?? {}),
    _serviceKey: serviceKey,
    _serviceActor: {
      userId: actor.userId,
      role: actor.role,
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    },
  }
}

// ============================================================================
// Auth helpers
// ============================================================================

function resolveDefaultAuth<TRole extends string = string>(
  event: { context: Record<string, unknown> },
): McpAuthIdentity<TRole> | null {
  const auth = event.context.mcpAuth as {
    role?: string
    userId?: string
    tenantId?: string
  } | undefined
  if (!auth?.role || !auth?.userId) return null
  return {
    role: auth.role as TRole,
    userId: auth.userId,
    ...(auth.tenantId ? { tenantId: auth.tenantId } : {}),
  }
}

function normalizePreview(raw: string | PreviewResult): PreviewResult {
  return typeof raw === 'string' ? { summary: raw } : raw
}

function createToolCallFns(
  event: H3Event,
  actor: McpAuthIdentity | null,
  injectIdentity: boolean,
): ConvexToolCallFns {
  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      args?: FunctionArgs<Query>,
    ): Promise<FunctionReturnType<Query>> => {
      return await serverConvexQuery(
        event,
        fn,
        (
          injectIdentity
            ? injectServiceActorArgs(args as Record<string, unknown> | undefined, actor)
            : (args ?? {})
        ) as FunctionArgs<Query>,
        { auth: 'none' },
      )
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      args?: FunctionArgs<Mutation>,
    ): Promise<FunctionReturnType<Mutation>> => {
      return await serverConvexMutation(
        event,
        fn,
        (
          injectIdentity
            ? injectServiceActorArgs(args as Record<string, unknown> | undefined, actor)
            : (args ?? {})
        ) as FunctionArgs<Mutation>,
        { auth: 'none' },
      )
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      args?: FunctionArgs<Action>,
    ): Promise<FunctionReturnType<Action>> => {
      return await serverConvexAction(
        event,
        fn,
        (
          injectIdentity
            ? injectServiceActorArgs(args as Record<string, unknown> | undefined, actor)
            : (args ?? {})
        ) as FunctionArgs<Action>,
        { auth: 'none' },
      )
    },
  }
}

function createToolContext<TRole extends string>(
  event: H3Event,
  actor: McpAuthIdentity<TRole> | null,
  scoped: boolean,
): ConvexToolHandlerCtx<TRole> {
  const calls = createToolCallFns(event, actor, scoped)

  return {
    event,
    actor,
    ...calls,
    ok: (data, summary) => wrapSuccess(
      summary ? withSummary(data, summary) : data,
    ),
    error: (category, message, issues) => wrapError(category, message, issues),
    preview: (preview) => wrapPreview(normalizePreview(preview)),
    blocked: (preview) => wrapPreview({
      ...normalizePreview(preview),
      blocked: true,
    }),
  }
}

// ============================================================================
// Middleware validation
// ============================================================================

function isValidCallToolResult(value: unknown): value is McpToolCallbackResult {
  if (!value || typeof value !== 'object') return false
  return 'content' in value || 'structuredContent' in value
}

// ============================================================================
// Core builder
// ============================================================================

function _buildToolDefinition<
  S extends AnyConvexSchema,
  TRole extends string = string,
>(
  options: DefineConvexToolFullOptions<S, TRole>,
): McpToolDefinition<ConvexToolInputSchema<S>, ZodRawShape> {
  type BuiltToolDefinition = McpToolDefinition<ConvexToolInputSchema<S>, ZodRawShape>

  const {
    schema,
    handler,
    name,
    description = schema.description,
    operation = 'mutation',
    annotations: annotationOverrides,
    auth = 'none',
    check,
    destructive = false,
    maxItems,
    rateLimit,
    preview,
    group,
    tags,
    outputSchema,
    inputExamples: explicitInputExamples,
    middleware,
    enabled,
    cache,
    scoped = false,
    resolveAuth,
  } = options

  const toolLabel = name ? `defineTool:${name}` : 'defineTool'

  // ── Fail-fast definition-time validations ──────────────────────────────

  if (check && auth === 'none') {
    throw new Error(
      `defineTool: "check" needs auth. Set auth to "required" or "optional".`,
    )
  }

  if (preview && !destructive) {
    throw new Error(
      `defineTool: "preview" only applies to destructive tools. Set destructive: true.`,
    )
  }

  if (rateLimit && !name) {
    throw new Error(
      `defineTool: "rateLimit" requires an explicit "name" so tools have distinct rate-limit buckets.`,
    )
  }

  if (scoped && auth === 'none') {
    throw new Error(
      `defineTool: "scoped: true" requires auth. Set auth to "required" or "optional".`,
    )
  }

  if (maxItems && !(maxItems.field in schema.args)) {
    throw new Error(
      `defineTool: maxItems.field "${maxItems.field}" not found in schema validators. `
      + `Available: ${Object.keys(schema.args).join(', ')}`,
    )
  }

  // ── Build input schema ─────────────────────────────────────────────────

  let inputSchema = applyEnhancedFieldDescriptions(
    convexToMcpZodFields(schema.args),
    schema.meta.fields,
  ) as ConvexToolInputSchema<S>

  if (destructive) {
    inputSchema = {
      ...inputSchema,
      _confirmed: z.boolean().optional().describe('Set to true to confirm destructive action'),
    }
  }

  // ── Derive annotations ─────────────────────────────────────────────────

  const annotations = deriveAnnotations(operation, destructive, annotationOverrides)

  // ── Build description ──────────────────────────────────────────────────

  let finalDescription = description
  if (auth === 'required' && finalDescription) {
    finalDescription += '\n\nRequires authentication.'
  }

  // ── Auto-generate input examples ───────────────────────────────────────

  const inputExamples = toToolInputExamples<S>(
    explicitInputExamples ?? buildInputExamples(schema.meta.fields),
  )

  // ── Rate limit config ──────────────────────────────────────────────────

  const rateLimitConfig = rateLimit
    ? { max: rateLimit.max, windowMs: parseWindowString(rateLimit.window) }
    : undefined

  // ── Auto-wrap outputSchema in our structured envelope ────────────────

  const wrappedOutputSchema = outputSchema
    ? { ok: z.literal(true), data: z.object(outputSchema) }
    : undefined

  // ── The wrapped handler with safety pipeline ───────────────────────────

  const wrappedHandler = toToolHandler<S>(async (
    args: ConvexToolHandlerArgs<S>,
  ): Promise<McpToolCallbackResult> => {
    try {
      // ── Step 1: Resolve event + auth once ─────────────────────────────
      const { useEvent } = await import('nitropack/runtime')
      const event = useEvent()

      let resolvedAuth: McpAuthIdentity<TRole> | null = null
      if (auth !== 'none') {
          resolvedAuth = resolveAuth
            ? await resolveAuth(event)
            : resolveDefaultAuth(event)
      }

      // ── Step 2: Auth check ────────────────────────────────────────────
      if (auth === 'required' && !resolvedAuth) {
        return wrapError('auth', 'Authentication required.')
      }

      // ── Step 3: Optional actor check ──────────────────────────────────
      if (check) {
        if (!resolvedAuth) {
          return wrapError('auth', 'Authentication required.')
        }
        const allowed = await check(resolvedAuth)
        if (!allowed) {
          return wrapError('auth', 'Forbidden.')
        }
      }

      // ── Step 3b: Scoped calls require tenantId on the actor ───────────
      if (scoped) {
        if (!resolvedAuth) {
          return wrapError('auth', 'Authentication required for scoped tools.')
        }
        if (!resolvedAuth.tenantId) {
          return wrapError('auth', 'MCP token must include tenantId for scoped tools.')
        }
      }

      const ctx = createToolContext(
        event,
        resolvedAuth,
        scoped,
      )

      const normalizedArgs = normalizeToolArgs(args)

      // ── Step 4: Rate limit (after auth so failed-auth requests don't consume tokens) ──
      if (rateLimitConfig) {
        const rateLimitBucket = resolvedAuth ? `${name!}:${resolvedAuth.userId}` : name!
        const check = globalRateLimiter.check(rateLimitBucket, rateLimitConfig)
        if (!check.allowed) {
          return wrapError(
            'cooldown',
            `Rate limit exceeded (${rateLimit!.max} per ${rateLimit!.window}). Try again in ${check.retryAfterSeconds} seconds.`,
          )
        }
      }

      // ── Step 5: Max items ─────────────────────────────────────────────
      if (maxItems) {
        const arr = normalizedArgs.clean[maxItems.field]
        if (Array.isArray(arr) && arr.length > maxItems.limit) {
          return wrapError(
            'scope_exceeded',
            `Cannot process more than ${maxItems.limit} items at once. Received ${arr.length}.`,
          )
        }
      }

      // ── Step 6: Middleware ────────────────────────────────────────────
      if (middleware) {
        const result = await middleware(
          normalizedArgs.clean,
          ctx,
          async () => runHandlerWithConfirmation(normalizedArgs, ctx),
        )
        if (!isValidCallToolResult(result)) {
          return wrapError('server', `[${toolLabel}] Middleware must return a result. Did you forget to \`return next()\`?`)
        }
        return result
      }

      // ── Steps 7-9: Preview, confirmation, handler ─────────────────────
      return await runHandlerWithConfirmation(normalizedArgs, ctx)
    }
    catch (err) {
      console.error(`[${toolLabel}]`, err)
      const convexError = toConvexError(err)
      const message = cleanErrorMessage(convexError.message)
      const category = convexError.category !== 'unknown'
        ? convexError.category
        : inferCategoryFromMessage(message) ?? 'unknown'
      return wrapError(category, message, convexError.issues)
    }
  })

  async function runHandlerWithConfirmation(
    args: NormalizedToolArgs<S>,
    ctx: ConvexToolMiddlewareCtx<TRole>,
  ): Promise<McpToolCallbackResult> {
    // Step 7: Preview routing
    if (destructive && preview && !args.confirmed) {
      const raw = await preview(args.clean, ctx)
      if (isValidCallToolResult(raw)) {
        return raw
      }
      return wrapPreview(normalizePreview(raw))
    }

    // Step 8: Confirmation gate
    if (destructive && !args.confirmed) {
      return wrapError(
        'confirmation_required',
        'This action is destructive. Call again with _confirmed: true to proceed.',
      )
    }

    // Step 9: Handler — strip _confirmed before passing to user handler
    const result = await handler(args.clean, ctx)
    if (isValidCallToolResult(result)) {
      return result
    }
    return wrapSuccess(result)
  }

  const definition: BuiltToolDefinition = {
    name,
    description: finalDescription,
    inputSchema,
    outputSchema: wrappedOutputSchema,
    annotations,
    inputExamples,
    group,
    tags,
    enabled: auth === 'required'
      ? async (event) => {
          const baseVisible = await enabled?.(event)
          if (baseVisible === false) return false
          const resolved = resolveAuth
            ? await resolveAuth(event)
            : resolveDefaultAuth(event)
          return resolved !== null
        }
      : enabled,
    cache,
    handler: wrappedHandler,
  }

  return definition
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Define an agent-ready MCP tool from a shared Convex schema.
 *
 * Returns structured responses (`ok: true/false`) with typed data and
 * categorized errors. Supports progressive safety features as flat options.
 *
 * @example
 * ```ts
 * // Level 1 — just make it work
 * export default defineTool({
 *   schema: defineArgs({ description: 'List all notes', args: {} }),
 *   handler: () => serverConvexQuery(api.notes.list, {}),
 * })
 *
 * // Level 2 — add auth
 * export default defineTool({
 *   schema: createPostSchema,
 *   auth: 'required',
 *   handler: (args) => serverConvexMutation(api.posts.create, args),
 * })
 *
 * // Level 3 — destructive with preview
 * export default defineTool({
 *   schema: deletePostSchema,
 *   auth: 'required',
 *   destructive: true,
 *   preview: async (args) => {
 *     const post = await serverConvexQuery(api.posts.get, { id: args.id })
 *     return post ? `Will permanently delete "${post.title}"` : 'Post not found'
 *   },
 *   handler: (args) => serverConvexMutation(api.posts.remove, args),
 * })
 * ```
 */
export function defineTool<
  S extends AnyConvexSchema,
  TRole extends string = string,
>(
  options: DefineConvexToolOptions<S, TRole>,
): McpToolDefinition {
  return _buildToolDefinition(options as DefineConvexToolFullOptions<S, TRole>) as McpToolDefinition
}

import type {
  McpToolAnnotations,
  McpToolCallbackResult,
  McpToolDefinition,
} from '@nuxtjs/mcp-toolkit/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { ZodRawShape, ZodTypeAny } from 'zod'

import { subject, type Subject } from '../auth/index.js'
import type { SchemaFieldMeta } from '../convex/shared/define-convex-schema.js'
import type { ActingFor } from '../functions/define-acting-for.js'
import { extractSubject } from '../identity-forwarding/shared.js'
import { createServerConvexCaller } from '../server/index.js'
import type { ConvexToolOperation } from '../utils/types.js'
import { convexToMcpZodFields } from './convex-to-mcp-zod.js'
import { normalizeMcpError } from './error-normalization.js'
import { checkToolRateLimit, parseWindowString } from './rate-limiter.js'
import { withSummary, wrapError, wrapPreview, wrapSuccess } from './result-envelope.js'
import type {
  AnyConvexSchema,
  ConvexToolCallFns,
  ConvexToolHandlerCtx,
  DefineConvexToolOptions,
  InferSchemaData,
  McpAuthIdentity,
} from './types.js'
import { assertUnsafePermit } from './unsafe-permit.js'

function assertProductionRateLimitStore(
  toolName: string | undefined,
  rateLimit: { max: number; window: string } | undefined,
  rateLimitStore: unknown,
): void {
  if (process.env.NODE_ENV !== 'production' || !rateLimit || rateLimitStore) {
    return
  }

  throw new Error(
    `${toolName ?? 'defineTool'}: production MCP rate limiting requires an explicit distributed rate-limit store. Configure createRedisMcpRateLimitStore(...) and pass it as rateLimitStore.`,
  )
}

// ============================================================================
// Internal options (adds factory-injected fields — not part of public API)
// ============================================================================

// ============================================================================
// Input schema types
// ============================================================================

type ConvexMcpInputSchema = ZodRawShape

type ConvexToolInputSchema = ConvexMcpInputSchema

type ConvexToolHandlerArgs<S extends AnyConvexSchema> = InferSchemaData<S>

type ConvexToolGeneratedExamples<V extends PropertyValidators> = Partial<
  Record<keyof V & string, unknown>
>[]

type DefineConvexToolInternalOptions<
  S extends AnyConvexSchema,
  TRole extends string = string,
> = DefineConvexToolOptions<S, TRole> & {
  operation?: ConvexToolOperation
  operationBackedDestructive?: boolean
}

interface NormalizedToolArgs<S extends AnyConvexSchema> {
  clean: InferSchemaData<S>
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
        return {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        }
      case 'action':
        return {
          readOnlyHint: false,
          destructiveHint: destructive ?? false,
          idempotentHint: false,
          openWorldHint: true,
        }
      case 'mutation':
      default:
        return {
          readOnlyHint: false,
          destructiveHint: destructive ?? false,
          idempotentHint: false,
          openWorldHint: false,
        }
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
      .map((e) => JSON.stringify(e))
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
  shape: ConvexMcpInputSchema,
  fields: { [K in keyof V]: SchemaFieldMeta } | undefined,
): ConvexMcpInputSchema {
  if (!fields) return shape

  const describedShape = { ...shape } as Record<string, ZodTypeAny>

  for (const [fieldName, fieldSchema] of Object.entries(shape) as [keyof V, ZodTypeAny][]) {
    const meta = fields[fieldName]
    if (!meta) continue
    const baseDescription = fieldSchema.description
    const enhancedDescription = buildFieldDescription(meta)
    const description =
      baseDescription && enhancedDescription
        ? `${baseDescription}. ${enhancedDescription}`
        : (baseDescription ?? enhancedDescription)
    if (description && description !== baseDescription) {
      describedShape[String(fieldName)] = fieldSchema.describe(description)
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

  const example: Partial<Record<string, unknown>> = {}
  let hasAny = false

  for (const [key, meta] of Object.entries(fields) as [string, SchemaFieldMeta][]) {
    if (meta.examples?.length) {
      example[key] = meta.examples[0]
      hasAny = true
    }
  }

  return hasAny ? [example] : undefined
}

function toToolInputExamples<S extends AnyConvexSchema>(
  examples: Partial<InferSchemaData<S>>[] | Partial<Record<string, unknown>>[] | undefined,
): McpToolDefinition<ConvexToolInputSchema, ZodRawShape>['inputExamples'] {
  return examples as McpToolDefinition<ConvexToolInputSchema, ZodRawShape>['inputExamples']
}

function toToolHandler<S extends AnyConvexSchema>(
  handler: (args: ConvexToolHandlerArgs<S>) => Promise<McpToolCallbackResult>,
): McpToolDefinition<ConvexToolInputSchema, ZodRawShape>['handler'] {
  return handler as unknown as McpToolDefinition<ConvexToolInputSchema, ZodRawShape>['handler']
}

function normalizeToolArgs<S extends AnyConvexSchema>(
  args: ConvexToolHandlerArgs<S>,
): NormalizedToolArgs<S> {
  return {
    clean: args as InferSchemaData<S>,
  }
}

// ============================================================================
// Auth helpers
// ============================================================================

function resolveDefaultAuth<TRole extends string = string>(event: {
  context: Record<string, unknown>
}): McpAuthIdentity<TRole> | null {
  const auth = (event.context.__trellisMcpAuth ?? event.context.mcpAuth) as
    | {
        role?: string
        userId?: string
        workspaceId?: string
      }
    | undefined
  if (!auth?.role || !auth?.userId) return null
  return {
    role: auth.role as TRole,
    userId: auth.userId,
    ...(auth.workspaceId ? { workspaceId: auth.workspaceId } : {}),
  }
}

interface ToolAccessResolution<TRole extends string = string> {
  appIdentity: McpAuthIdentity<TRole> | null
  deniedReason: string | null
}

interface ResolveToolAccessOptions<TRole extends string = string> {
  auth: DefineConvexToolOptions<AnyConvexSchema, TRole>['auth']
  scoped: boolean
  check?: (appIdentity: McpAuthIdentity<TRole>) => boolean | Promise<boolean>
  resolveAuth?: (
    event: H3Event,
  ) => McpAuthIdentity<TRole> | null | Promise<McpAuthIdentity<TRole> | null>
}

type TrustedToolCaller = { subject: Subject } & Record<string, unknown>

async function resolveToolCaller<TRole extends string = string>(
  appIdentity: McpAuthIdentity<TRole> | null,
  resolveCaller?: (appIdentity: McpAuthIdentity<TRole>) => unknown | Promise<unknown>,
): Promise<unknown> {
  if (!appIdentity) {
    return undefined
  }

  if (!resolveCaller) {
    return {
      kind: 'user',
      userId: appIdentity.userId,
      subject: subject.user(appIdentity.userId),
    }
  }

  return await resolveCaller(appIdentity)
}

async function resolveToolActingFor<TRole extends string = string>(
  appIdentity: McpAuthIdentity<TRole> | null,
  resolveActingFor?: (
    appIdentity: McpAuthIdentity<TRole>,
  ) => ActingFor | null | Promise<ActingFor | null>,
): Promise<ActingFor | null> {
  if (!appIdentity || !resolveActingFor) {
    return null
  }

  return await resolveActingFor(appIdentity)
}

async function resolveToolAccess<TRole extends string = string>(
  event: H3Event,
  options: ResolveToolAccessOptions<TRole>,
): Promise<ToolAccessResolution<TRole>> {
  const { auth, scoped, check, resolveAuth } = options

  let appIdentity: McpAuthIdentity<TRole> | null = null
  if (auth !== 'none') {
    appIdentity = resolveAuth ? await resolveAuth(event) : resolveDefaultAuth(event)
  }

  if (auth === 'required' && !appIdentity) {
    return { appIdentity, deniedReason: 'Authentication required.' }
  }

  if (scoped) {
    if (!appIdentity) {
      return {
        appIdentity,
        deniedReason: 'Authentication required for scoped tools.',
      }
    }
    if (!appIdentity.workspaceId) {
      return {
        appIdentity,
        deniedReason: 'MCP token must include workspaceId for scoped tools.',
      }
    }
  }

  if (check) {
    if (!appIdentity) {
      return { appIdentity, deniedReason: 'Authentication required.' }
    }
    const allowed = await check(appIdentity)
    if (!allowed) {
      return { appIdentity, deniedReason: 'Forbidden.' }
    }
  }

  return { appIdentity, deniedReason: null }
}

function createToolCallFns(
  event: H3Event,
  appIdentity: McpAuthIdentity | null,
  caller: unknown,
  actingFor: ActingFor | null,
): ConvexToolCallFns {
  let convex: ReturnType<typeof createServerConvexCaller> | null = null

  const requireTrustedCaller = (): TrustedToolCaller => {
    if (!caller || typeof caller !== 'object') {
      throw new Error(
        'defineTool: authenticated Convex calls require resolveCaller() to return an object with a canonical subject.',
      )
    }

    if (!extractSubject(caller)) {
      throw new Error(
        'defineTool: authenticated Convex calls require resolveCaller() to return a caller with a canonical subject.',
      )
    }

    return caller as TrustedToolCaller
  }

  const getConvex = () => {
    if (convex) {
      return convex
    }

    convex = appIdentity
      ? createServerConvexCaller(event, {
          auth: 'trusted',
          caller: requireTrustedCaller(),
          ...(actingFor ? { actingFor } : {}),
        })
      : createServerConvexCaller(event, { auth: 'none' })

    return convex
  }

  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      args?: FunctionArgs<Query>,
    ): Promise<FunctionReturnType<Query>> => {
      return await getConvex().query(fn, args)
    },
  }
}

function createToolContext<TRole extends string>(
  event: H3Event,
  appIdentity: McpAuthIdentity<TRole> | null,
  caller: unknown,
  actingFor: ActingFor | null,
): ConvexToolHandlerCtx<TRole> {
  const calls = createToolCallFns(event, appIdentity, caller, actingFor)

  return {
    event,
    appIdentity,
    ...calls,
    ok: (data, summary) => wrapSuccess(summary ? withSummary(data, summary) : data),
    error: (category, message, issues, explanation, details, code) =>
      wrapError(category, message, issues, explanation, details, code),
    preview: (preview) => wrapPreview(preview),
    blocked: (preview) => wrapPreview({ ...preview, allowed: false, confirmation: undefined }),
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

function _buildToolDefinition<S extends AnyConvexSchema, TRole extends string = string>(
  options: DefineConvexToolInternalOptions<S, TRole>,
): McpToolDefinition<ConvexToolInputSchema, ZodRawShape> {
  type BuiltToolDefinition = McpToolDefinition<ConvexToolInputSchema, ZodRawShape>

  const {
    schema,
    handler,
    name,
    description = schema.description,
    effect,
    permit,
    operation = effect === 'external-service' ? 'action' : 'query',
    annotations: annotationOverrides,
    auth = 'none',
    check,
    destructive = false,
    operationBackedDestructive = false,
    maxItems,
    rateLimit,
    rateLimitStore,
    group,
    tags,
    outputSchema,
    inputExamples: explicitInputExamples,
    middleware,
    enabled,
    cache,
    scoped = false,
    resolveAuth,
    resolveCaller,
    resolveActingFor,
  } = options

  const toolLabel = name ? `defineTool:${name}` : 'defineTool'

  // ── Fail-fast definition-time validations ──────────────────────────────

  if (check && auth === 'none') {
    throw new Error(`defineTool: "check" needs auth. Set auth to "required" or "optional".`)
  }

  if (destructive && !operationBackedDestructive) {
    throw new Error(
      'defineTool: destructive tools must be operation-backed. Use defineMcpApp(...).tool.operation(...).',
    )
  }

  if (effect === 'external-service') {
    assertUnsafePermit(permit, 'external-service custom MCP tools')
  }

  if (rateLimit && !name) {
    throw new Error(
      `defineTool: "rateLimit" requires an explicit "name" so tools have distinct rate-limit buckets.`,
    )
  }

  assertProductionRateLimitStore(toolLabel, rateLimit, rateLimitStore)

  if (scoped && auth !== 'required') {
    throw new Error(`defineTool: "scoped: true" requires auth: "required".`)
  }

  if (maxItems && !(maxItems.field in schema.args)) {
    throw new Error(
      `defineTool: maxItems.field "${maxItems.field}" not found in schema validators. ` +
        `Available: ${Object.keys(schema.args).join(', ')}`,
    )
  }

  // ── Build input schema ─────────────────────────────────────────────────

  const inputSchema = applyEnhancedFieldDescriptions(
    convexToMcpZodFields(schema.args),
    schema.meta.fields,
  ) as ConvexToolInputSchema

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

  const wrappedHandler = toToolHandler<S>(
    async (args: ConvexToolHandlerArgs<S>): Promise<McpToolCallbackResult> => {
      try {
        // ── Step 1: Resolve event + auth once ─────────────────────────────
        const { useEvent } = await import('nitropack/runtime')
        const event = useEvent()

        const access = await resolveToolAccess(event, {
          auth,
          scoped,
          check,
          resolveAuth,
        })
        if (access.deniedReason) {
          return wrapError('auth', access.deniedReason)
        }

        const resolvedAuth = access.appIdentity
        const resolvedCaller = await resolveToolCaller(
          resolvedAuth,
          resolveCaller ? (appIdentity) => resolveCaller({ event, appIdentity }) : undefined,
        )
        const resolvedActingFor = await resolveToolActingFor(
          resolvedAuth,
          resolveActingFor ? (appIdentity) => resolveActingFor({ event, appIdentity }) : undefined,
        )
        const ctx = createToolContext(event, resolvedAuth, resolvedCaller, resolvedActingFor)

        const normalizedArgs = normalizeToolArgs(args)

        // ── Step 2: Rate limit (after auth so failed-auth requests don't consume tokens) ──
        if (rateLimitConfig) {
          const rateLimitBucket = resolvedAuth ? `${name!}:${resolvedAuth.userId}` : name!
          const check = await checkToolRateLimit(rateLimitBucket, rateLimitConfig, rateLimitStore)
          if (!check.allowed) {
            return wrapError(
              'cooldown',
              `Rate limit exceeded (${rateLimit!.max} per ${rateLimit!.window}). Try again in ${check.retryAfterSeconds} seconds.`,
            )
          }
        }

        // ── Step 3: Max items ─────────────────────────────────────────────
        if (maxItems) {
          const cleanArgs = normalizedArgs.clean as Record<string, unknown>
          const arr = cleanArgs[maxItems.field]
          if (Array.isArray(arr) && arr.length > maxItems.limit) {
            return wrapError(
              'scope_exceeded',
              `Cannot process more than ${maxItems.limit} items at once. Received ${arr.length}.`,
            )
          }
        }

        // ── Step 4: Middleware ────────────────────────────────────────────
        if (middleware) {
          const result = await middleware(normalizedArgs.clean, ctx, async () =>
            runHandler(normalizedArgs, ctx),
          )
          if (!isValidCallToolResult(result)) {
            return wrapError(
              'server',
              `[${toolLabel}] Middleware must return a result. Did you forget to \`return next()\`?`,
            )
          }
          return result
        }

        // ── Step 5: Handler ───────────────────────────────────────────────
        return await runHandler(normalizedArgs, ctx)
      } catch (err) {
        console.error(`[${toolLabel}]`, err)
        const normalizedError = normalizeMcpError(err)
        return wrapError(normalizedError)
      }
    },
  )

  async function runHandler(
    args: NormalizedToolArgs<S>,
    ctx: ConvexToolHandlerCtx<TRole>,
  ): Promise<McpToolCallbackResult> {
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
    enabled: async (event) => {
      const baseVisible = await enabled?.(event)
      if (baseVisible === false) return false

      const access = await resolveToolAccess(event, {
        auth,
        scoped,
        check,
        resolveAuth,
      })

      return access.deniedReason === null
    },
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
 *   effect: 'read',
 *   handler: () => serverConvexQuery(api.notes.list, {}),
 * })
 *
 * // Level 2 — add auth
 * export default defineTool({
 *   schema: createPostSchema,
 *   effect: 'diagnostic',
 *   auth: 'required',
 *   handler: () => ({ ok: true }),
 * })
 *
 * // Level 3 — destructive tools are operation-backed
 * // Use defineMcpApp(...).tool.operation(...) instead of defineTool(...)
 * ```
 */
export function defineTool<S extends AnyConvexSchema, TRole extends string = string>(
  options: DefineConvexToolOptions<S, TRole>,
): McpToolDefinition {
  return _buildToolDefinition(options) as unknown as McpToolDefinition
}

export function defineToolInternal<S extends AnyConvexSchema, TRole extends string = string>(
  options: DefineConvexToolInternalOptions<S, TRole>,
): McpToolDefinition {
  return _buildToolDefinition(options) as unknown as McpToolDefinition
}

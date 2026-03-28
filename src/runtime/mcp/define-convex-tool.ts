import type { H3Event } from 'h3'
import type {
  McpRequestExtra,
  McpToolAnnotations,
  McpToolCallbackResult,
  McpToolDefinition,
} from '@nuxtjs/mcp-toolkit/server'
import { convexToZodFields } from 'convex-helpers/server/zod4'
import type { ZodValidatorFromConvex } from 'convex-helpers/server/zod4'
import type { PropertyValidators } from 'convex/values'
import { z } from 'zod'
import type { ZodRawShape, ZodTypeAny } from 'zod'

import type { CheckPermissionFn } from '../composables/usePermissions'
import { toConvexError } from '../utils/call-result'
import type { ConvexSchemaFieldMeta } from '../utils/define-convex-schema'
import type { ConvexToolOperation } from '../utils/types'

import { cleanErrorMessage, inferCategoryFromMessage } from './error-helpers'
import { globalRateLimiter, parseWindowString } from './rate-limiter'
import { wrapError, wrapPreview, wrapSuccess } from './result-envelope'
import type {
  AnyConvexSchema,
  ConvexToolMiddlewareCtx,
  CreateConvexToolsOptions,
  DefineConvexToolOptions,
  InferSchemaData,
  InferSchemaValidators,
  PreviewResult,
} from './types'

// ============================================================================
// Internal options (adds factory-injected fields — not part of public API)
// ============================================================================

interface DefineConvexToolFullOptions<
  S extends AnyConvexSchema,
  P extends string = string,
> extends DefineConvexToolOptions<S, P> {
  _checkPermission?: CheckPermissionFn<P>
  _resolveAuth?: (event: H3Event) => { role: string; userId: string } | null | Promise<{ role: string; userId: string } | null>
}

// ============================================================================
// Input schema types
// ============================================================================

type ConvexMcpInputSchema<V extends PropertyValidators> = {
  [K in keyof V]: ZodValidatorFromConvex<V[K]>
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

function buildFieldDescription(meta: ConvexSchemaFieldMeta): string | undefined {
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
  fields: { [K in keyof V]: ConvexSchemaFieldMeta } | undefined,
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
  fields: { [K in keyof V]: ConvexSchemaFieldMeta } | undefined,
): Record<string, unknown>[] | undefined {
  if (!fields) return undefined

  const example: Record<string, unknown> = {}
  let hasAny = false

  for (const [key, meta] of Object.entries(fields) as [string, ConvexSchemaFieldMeta][]) {
    if (meta.examples?.length) {
      example[key] = meta.examples[0]
      hasAny = true
    }
  }

  return hasAny ? [example] : undefined
}

// ============================================================================
// Auth helpers
// ============================================================================

function resolveDefaultAuth(event: { context: Record<string, unknown> }): { role: string; userId: string } | null {
  const auth = event.context.mcpAuth as { role?: string; userId?: string } | undefined
  if (!auth?.role || !auth?.userId) return null
  return { role: auth.role, userId: auth.userId }
}

function normalizePreview(raw: string | PreviewResult): PreviewResult {
  return typeof raw === 'string' ? { summary: raw } : raw
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
  P extends string = string,
>(
  options: DefineConvexToolFullOptions<S, P>,
): McpToolDefinition<ConvexMcpInputSchema<InferSchemaValidators<S>> & { _confirmed?: ZodTypeAny }, ZodRawShape> {
  const {
    schema,
    handler,
    name,
    description = schema.meta?.description,
    operation = 'mutation',
    annotations: annotationOverrides,
    auth = 'none',
    require: requiredPermission,
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
    _checkPermission,
    _resolveAuth,
  } = options

  const toolLabel = name ? `defineConvexTool:${name}` : 'defineConvexTool'

  // ── Fail-fast definition-time validations ──────────────────────────────

  if (requiredPermission && !_checkPermission) {
    throw new Error(
      `defineConvexTool: "require" needs a checkPermission function. `
      + `Use createConvexTools({ checkPermission }) or pass _checkPermission directly.`,
    )
  }

  if (requiredPermission && auth === 'none') {
    throw new Error(
      `defineConvexTool: "require" needs auth. Set auth to "required" or "optional".`,
    )
  }

  if (preview && !destructive) {
    throw new Error(
      `defineConvexTool: "preview" only applies to destructive tools. Set destructive: true.`,
    )
  }

  if (rateLimit && !name) {
    throw new Error(
      `defineConvexTool: "rateLimit" requires an explicit "name" so tools have distinct rate-limit buckets.`,
    )
  }

  if (maxItems && !(maxItems.field in schema.args)) {
    throw new Error(
      `defineConvexTool: maxItems.field "${maxItems.field}" not found in schema args. `
      + `Available: ${Object.keys(schema.args).join(', ')}`,
    )
  }

  // ── Build input schema ─────────────────────────────────────────────────

  let inputSchema = applyEnhancedFieldDescriptions(
    convexToZodFields(schema.args),
    schema.meta?.fields,
  ) as ConvexMcpInputSchema<InferSchemaValidators<S>> & { _confirmed?: ZodTypeAny }

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

  const inputExamples = explicitInputExamples ?? buildInputExamples(schema.meta?.fields)

  // ── Rate limit config ──────────────────────────────────────────────────

  const rateLimitConfig = rateLimit
    ? { max: rateLimit.max, windowMs: parseWindowString(rateLimit.window) }
    : undefined

  // ── Determine if pipeline needs event access ───────────────────────────

  const needsEvent = auth !== 'none' || !!middleware || (destructive && !!preview)

  // ── The wrapped handler with safety pipeline ───────────────────────────

  const wrappedHandler = async (
    args: InferSchemaData<S> & { _confirmed?: boolean },
    extra: McpRequestExtra,
  ): Promise<McpToolCallbackResult> => {
    try {
      // ── Step 1: Resolve event + auth once ─────────────────────────────
      let resolvedAuth: { role: string; userId: string } | null = null
      let middlewareCtx: ConvexToolMiddlewareCtx<P> | undefined

      if (needsEvent) {
        const { useEvent } = await import('h3')
        const event = useEvent()

        if (auth !== 'none') {
          resolvedAuth = _resolveAuth
            ? await _resolveAuth(event)
            : resolveDefaultAuth(event)
        }

        middlewareCtx = {
          event,
          mcpAuth: resolvedAuth ?? (event.context.mcpAuth as unknown),
          can: (permission: P, resource?: { ownerId?: string; [key: string]: unknown }) => {
            if (!_checkPermission || !resolvedAuth) return false
            return _checkPermission(resolvedAuth, permission, resource)
          },
        }
      }

      // ── Step 2: Auth check ────────────────────────────────────────────
      if (auth === 'required' && !resolvedAuth) {
        return wrapError('auth', 'Authentication required.')
      }

      // ── Step 3: Permission check ──────────────────────────────────────
      if (requiredPermission && _checkPermission) {
        if (!resolvedAuth) {
          return wrapError('auth', 'Authentication required.')
        }
        const allowed = _checkPermission(resolvedAuth, requiredPermission)
        if (!allowed) {
          return wrapError(
            'auth',
            `Permission denied: requires '${requiredPermission}' (your role: ${resolvedAuth.role}).`,
          )
        }
      }

      // ── Step 4: Rate limit (after auth so failed-auth requests don't consume tokens) ──
      if (rateLimitConfig) {
        const check = globalRateLimiter.check(name!, rateLimitConfig)
        if (!check.allowed) {
          return wrapError(
            'cooldown',
            `Rate limit exceeded (${rateLimit!.max} per ${rateLimit!.window}). Try again in ${check.retryAfterSeconds} seconds.`,
          )
        }
      }

      // ── Step 5: Max items ─────────────────────────────────────────────
      if (maxItems) {
        const arr = (args as Record<string, unknown>)[maxItems.field]
        if (Array.isArray(arr) && arr.length > maxItems.limit) {
          return wrapError(
            'scope_exceeded',
            `Cannot process more than ${maxItems.limit} items at once. Received ${arr.length}.`,
          )
        }
      }

      // ── Step 6: Middleware ────────────────────────────────────────────
      if (middleware) {
        if (!middlewareCtx) {
          return wrapError('server', `[${toolLabel}] Internal error: middleware context was not initialized.`)
        }
        const result = await middleware(
          args as InferSchemaData<S>,
          middlewareCtx,
          async () => runHandlerWithConfirmation(args, extra, middlewareCtx),
        )
        if (!isValidCallToolResult(result)) {
          return wrapError('server', `[${toolLabel}] Middleware must return a result. Did you forget to \`return next()\`?`)
        }
        return result
      }

      // ── Steps 7-9: Preview, confirmation, handler ─────────────────────
      return await runHandlerWithConfirmation(args, extra, middlewareCtx)
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
  }

  async function runHandlerWithConfirmation(
    args: InferSchemaData<S> & { _confirmed?: boolean },
    extra: McpRequestExtra,
    ctx: ConvexToolMiddlewareCtx<P> | undefined,
  ): Promise<McpToolCallbackResult> {
    const confirmed = args._confirmed === true

    // Step 7: Preview routing
    if (destructive && preview && !confirmed) {
      if (!ctx) {
        return wrapError('server', `[${toolLabel}] Internal error: preview context was not initialized.`)
      }
      const raw = await preview(args as InferSchemaData<S>, ctx)
      return wrapPreview(normalizePreview(raw))
    }

    // Step 8: Confirmation gate
    if (destructive && !confirmed) {
      return wrapError(
        'confirmation_required',
        'This action is destructive. Call again with _confirmed: true to proceed.',
      )
    }

    // Step 9: Handler — strip _confirmed before passing to user handler
    const { _confirmed: _, ...cleanArgs } = args as InferSchemaData<S> & { _confirmed?: boolean }
    const result = await handler(cleanArgs as InferSchemaData<S>, extra)
    return wrapSuccess(result)
  }

  return {
    name,
    description: finalDescription,
    inputSchema,
    outputSchema,
    annotations,
    inputExamples: inputExamples as any,
    group,
    tags,
    enabled,
    cache,
    handler: wrappedHandler as any,
  }
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
 * export default defineConvexTool({
 *   schema: defineConvexSchema({}, { description: 'List all notes' }),
 *   handler: () => serverConvexQuery(api.notes.list, {}),
 * })
 *
 * // Level 2 — add auth
 * export default defineConvexTool({
 *   schema: createPostSchema,
 *   auth: 'required',
 *   handler: (args) => serverConvexMutation(api.posts.create, args),
 * })
 *
 * // Level 3 — destructive with preview
 * export default defineConvexTool({
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
export function defineConvexTool<
  S extends AnyConvexSchema,
  P extends string = string,
>(
  options: DefineConvexToolOptions<S, P>,
): McpToolDefinition {
  return _buildToolDefinition(options as DefineConvexToolFullOptions<S, P>) as McpToolDefinition
}

/**
 * Create a typed tool factory with your permission system baked in.
 *
 * Mirrors the `createPermissions` pattern from the client side.
 * Define once, get typed `require` autocomplete everywhere.
 *
 * @example
 * ```ts
 * // server/mcp/utils/tools.ts
 * import { createConvexTools } from 'better-convex-nuxt/mcp'
 * import { checkPermission } from '~~/convex/permissions.config'
 *
 * export const { defineConvexTool } = createConvexTools({
 *   checkPermission,
 * })
 *
 * // server/mcp/tools/create-post.ts
 * import { defineConvexTool } from '../utils/tools'
 *
 * export default defineConvexTool({
 *   schema: createPostSchema,
 *   auth: 'required',
 *   require: 'post.create',  // ← autocomplete + type error on typos
 *   handler: (args) => serverConvexMutation(api.posts.create, args),
 * })
 * ```
 */
export function createConvexTools<P extends string = string>(
  factoryOptions: CreateConvexToolsOptions<P>,
) {
  return {
    defineConvexTool: <S extends AnyConvexSchema>(
      toolOptions: DefineConvexToolOptions<S, P>,
    ): McpToolDefinition => {
      return _buildToolDefinition({
        ...toolOptions,
        _checkPermission: factoryOptions.checkPermission,
        _resolveAuth: factoryOptions.resolveAuth,
      } as DefineConvexToolFullOptions<S, P>) as McpToolDefinition
    },
  }
}

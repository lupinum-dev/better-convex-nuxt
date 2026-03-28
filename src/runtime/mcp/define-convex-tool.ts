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
// Safety pipeline
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
// Core builder
// ============================================================================

function _buildToolDefinition<
  S extends AnyConvexSchema,
  P extends string = string,
>(
  options: DefineConvexToolOptions<S, P>,
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

  // Fail fast: require without checkPermission
  if (requiredPermission && !_checkPermission) {
    throw new Error(
      `defineConvexTool: "require" needs a checkPermission function. ` +
      `Use createConvexTools({ checkPermission }) or pass _checkPermission directly.`,
    )
  }

  // Build input schema
  let inputSchema = applyEnhancedFieldDescriptions(
    convexToZodFields(schema.args),
    schema.meta?.fields,
  ) as ConvexMcpInputSchema<InferSchemaValidators<S>> & { _confirmed?: ZodTypeAny }

  // Inject _confirmed for destructive tools
  if (destructive) {
    inputSchema = {
      ...inputSchema,
      _confirmed: z.boolean().optional().describe('Set to true to confirm destructive action'),
    }
  }

  // Derive annotations
  const annotations = deriveAnnotations(operation, destructive, annotationOverrides)

  // Build description
  let finalDescription = description
  if (auth === 'required' && finalDescription) {
    finalDescription += '\n\nRequires authentication.'
  }

  // Auto-generate input examples
  const inputExamples = explicitInputExamples ?? buildInputExamples(schema.meta?.fields)

  // Rate limit config
  const rateLimitConfig = rateLimit
    ? { max: rateLimit.max, windowMs: parseWindowString(rateLimit.window) }
    : undefined

  // Resolve tool name for rate limiting
  const toolNameForRateLimit = name ?? 'unknown-tool'

  // The wrapped handler with safety pipeline
  const wrappedHandler = async (
    args: InferSchemaData<S> & { _confirmed?: boolean },
    extra: McpRequestExtra,
  ): Promise<McpToolCallbackResult> => {
    try {
      // 1. Rate limit
      if (rateLimitConfig) {
        const check = globalRateLimiter.check(toolNameForRateLimit, rateLimitConfig)
        if (!check.allowed) {
          return wrapError(
            'cooldown',
            `Rate limit exceeded (${rateLimit!.max} per ${rateLimit!.window}). Try again in ${check.retryAfterSeconds} seconds.`,
          )
        }
      }

      // 2. Max items
      if (maxItems) {
        const arr = (args as Record<string, unknown>)[maxItems.field]
        if (Array.isArray(arr) && arr.length > maxItems.limit) {
          return wrapError(
            'scope_exceeded',
            `Cannot process more than ${maxItems.limit} items at once. Received ${arr.length}.`,
          )
        }
      }

      // 3. Auth check (uses useEvent from Nitro)
      let resolvedAuth: { role: string; userId: string } | null = null
      if (auth !== 'none') {
        // Dynamic import to avoid bundling h3 when not needed
        const { useEvent } = await import('h3')
        const event = useEvent()
        resolvedAuth = _resolveAuth
          ? await _resolveAuth(event)
          : resolveDefaultAuth(event)

        if (auth === 'required' && !resolvedAuth) {
          return wrapError('auth', 'Authentication required.')
        }
      }

      // 4. Permission check
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

      // Build middleware context
      const buildCtx = async (): Promise<ConvexToolMiddlewareCtx<P>> => {
        const { useEvent } = await import('h3')
        const event = useEvent()
        return {
          event,
          mcpAuth: resolvedAuth ?? (event.context.mcpAuth as unknown),
          can: (permission: P, resource?: { ownerId?: string; [key: string]: unknown }) => {
            if (!_checkPermission || !resolvedAuth) return false
            return _checkPermission(resolvedAuth, permission, resource)
          },
        }
      }

      // 5. Middleware
      if (middleware) {
        const ctx = await buildCtx()
        const middlewareResult = await middleware(
          args as InferSchemaData<S>,
          ctx,
          async () => {
            // Steps 6-8 run inside next()
            return await runHandlerWithConfirmation(args, extra)
          },
        )

        // If middleware returned a blocked result
        if (middlewareResult && typeof middlewareResult === 'object' && 'blocked' in (middlewareResult as Record<string, unknown>)) {
          const blocked = middlewareResult as { blocked: boolean; reason?: string }
          if (blocked.blocked) {
            return wrapError('auth', blocked.reason ?? 'Access denied by middleware.')
          }
        }

        // If middleware returned via next(), result is the handler result
        return middlewareResult as McpToolCallbackResult
      }

      // 6-8. Preview, confirmation, handler
      return await runHandlerWithConfirmation(args, extra)
    }
    catch (err) {
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
  ): Promise<McpToolCallbackResult> {
    const confirmed = args._confirmed === true

    // 6. Preview routing
    if (destructive && preview && !confirmed) {
      const ctx = await (async () => {
        const { useEvent } = await import('h3')
        const event = useEvent()
        const auth = _resolveAuth
          ? await _resolveAuth(event)
          : resolveDefaultAuth(event)
        return {
          event,
          mcpAuth: auth ?? (event.context.mcpAuth as unknown),
          can: (permission: P, resource?: { ownerId?: string; [key: string]: unknown }) => {
            if (!_checkPermission || !auth) return false
            return _checkPermission(auth, permission, resource)
          },
        } satisfies ConvexToolMiddlewareCtx<P>
      })()
      const raw = await preview(args as InferSchemaData<S>, ctx)
      return wrapPreview(normalizePreview(raw))
    }

    // 7. Confirmation gate
    if (destructive && !confirmed) {
      return wrapError(
        'confirmation_required',
        'This action is destructive. Call again with _confirmed: true to proceed.',
      )
    }

    // 8. Handler — strip _confirmed before passing to user handler
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
  return _buildToolDefinition(options) as McpToolDefinition
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
      }) as McpToolDefinition
    },
  }
}

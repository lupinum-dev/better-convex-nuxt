import type { H3Event } from 'h3'
import type {
  McpRequestExtra,
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
} from '@nuxtjs/mcp-toolkit/server'
import type { PropertyValidators } from 'convex/values'
import type { ZodRawShape } from 'zod'

import type { CheckPermissionFn, Resource } from '../composables/usePermissions'
import type { ConvexSchemaDefinition } from '../utils/define-convex-schema'
import type { ConvexErrorCategory, ConvexErrorIssue, ConvexToolOperation } from '../utils/types'

// ============================================================================
// Schema helpers (re-exported for convenience)
// ============================================================================

export type AnyConvexSchema = ConvexSchemaDefinition<any, PropertyValidators>

export type InferSchemaData<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<infer T, infer _V> ? T : never

export type InferSchemaValidators<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<any, infer V> ? V : never

// ============================================================================
// Structured response envelope
// ============================================================================

export interface ConvexToolSuccessResult<T = unknown> {
  ok: true
  data: T
}

export interface ConvexToolPreviewResult {
  ok: true
  preview: PreviewResult
  awaitingConfirmation: true
}

export interface ConvexToolErrorResult {
  ok: false
  error: {
    category: ConvexErrorCategory
    message: string
    retryable: boolean
    issues?: ConvexErrorIssue[]
  }
}

export type ConvexToolResult<T = unknown> =
  | ConvexToolSuccessResult<T>
  | ConvexToolPreviewResult
  | ConvexToolErrorResult

// ============================================================================
// Preview
// ============================================================================

export interface PreviewResult {
  summary: string
  warn?: string
  affects?: Record<string, number>
  blocked?: boolean
}

// ============================================================================
// Middleware context
// ============================================================================

export interface ConvexToolMiddlewareCtx<P extends string = string> {
  event: H3Event
  /** Resolved auth data, or null if auth is 'none' or no credentials provided. */
  mcpAuth: { role: string; userId: string } | null
  can: (permission: P, resource?: Resource) => boolean
}

export type ConvexToolMiddleware<
  S extends AnyConvexSchema,
  P extends string = string,
> = (
  args: InferSchemaData<S>,
  ctx: ConvexToolMiddlewareCtx<P>,
  next: () => Promise<McpToolCallbackResult>,
) => McpToolCallbackResult | Promise<McpToolCallbackResult>

// ============================================================================
// Tool options (public — what users type)
// ============================================================================

export interface DefineConvexToolOptions<
  S extends AnyConvexSchema,
  P extends string = string,
> {
  /** Shared Convex schema — provides input validation and metadata. */
  schema: S
  /** Tool handler. Return plain data — the framework wraps it. */
  handler: (args: InferSchemaData<S>, extra: McpRequestExtra) => unknown | Promise<unknown>

  // ── Identity ──────────────────────────────────────────────
  /** Tool name. Default: derived from filename by mcp-toolkit. */
  name?: string
  /** Tool description. Default: schema.meta.description. */
  description?: string

  // ── Operation & annotations ───────────────────────────────
  /** Convex operation type. Default: 'mutation'. */
  operation?: ConvexToolOperation
  /** Override auto-derived MCP annotations. */
  annotations?: Partial<McpToolAnnotations>

  // ── Auth ──────────────────────────────────────────────────
  /** Auth requirement. Default: 'none'. */
  auth?: 'required' | 'optional' | 'none'
  /** Permission string checked via checkPermission. Requires createConvexTools factory or checkPermission option. */
  require?: P

  // ── Safety ────────────────────────────────────────────────
  /**
   * Mark as destructive — enables two-call confirmation flow.
   *
   * Adds a `_confirmed` boolean to the input schema. On the first call
   * (without `_confirmed: true`), returns a preview (if `preview` is provided)
   * or a `confirmation_required` error. The second call with `_confirmed: true`
   * executes the handler.
   */
  destructive?: boolean
  /** Limit array field size for bulk operations. Field must exist in schema. */
  maxItems?: { field: keyof InferSchemaData<S> & string; limit: number }
  /** In-memory rate limit per tool name. Requires explicit `name`. */
  rateLimit?: { max: number; window: string }
  /** Preview function for destructive tools. Receives the same args as handler, plus the middleware context. */
  preview?: (
    args: InferSchemaData<S>,
    ctx: ConvexToolMiddlewareCtx<P>,
  ) => string | PreviewResult | Promise<string | PreviewResult>

  // ── Grouping ──────────────────────────────────────────────
  /** Functional group (auto-inferred from directory by mcp-toolkit). */
  group?: string
  /** Free-form tags for filtering. */
  tags?: string[]

  // ── Advanced ──────────────────────────────────────────────
  /** Explicit output schema for MCP metadata. */
  outputSchema?: ZodRawShape
  /** Example inputs for MCP agents. Auto-generated from field examples if omitted. */
  inputExamples?: Partial<InferSchemaData<S>>[]
  /** Custom middleware. Single function — compose internally if needed. */
  middleware?: ConvexToolMiddleware<S, P>
  /** Guard to include/hide this tool per-request. */
  enabled?: (event: H3Event) => boolean | Promise<boolean>
  /** Cache configuration (passed through to mcp-toolkit). */
  cache?: McpToolCache
}

// ============================================================================
// Factory
// ============================================================================

export interface CreateConvexToolsOptions<P extends string = string> {
  /** Permission check function from your permissions.config.ts */
  checkPermission: CheckPermissionFn<P>
  /** Custom auth resolver. Default: reads event.context.mcpAuth */
  resolveAuth?: (event: H3Event) => { role: string; userId: string } | null | Promise<{ role: string; userId: string } | null>
}

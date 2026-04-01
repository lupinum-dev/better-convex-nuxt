import type {
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
} from '@nuxtjs/mcp-toolkit/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'
import type { ZodRawShape } from 'zod'

import type { SchemaDefinition } from '../utils/define-convex-schema'
import type { ConvexErrorCategory, ConvexErrorIssue, ConvexToolOperation } from '../utils/types'

// ============================================================================
// Schema helpers (re-exported for convenience)
// ============================================================================

export type AnyConvexSchema = SchemaDefinition<unknown, PropertyValidators>

export type InferSchemaData<S extends AnyConvexSchema> =
  S extends SchemaDefinition<infer T, infer _V> ? T : never

export type InferSchemaValidators<S extends AnyConvexSchema> =
  S extends SchemaDefinition<unknown, infer V> ? V : never

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
// Auth identity
// ============================================================================

export interface McpAuthIdentity<TRole extends string = string> {
  readonly role: TRole
  readonly userId: string
  readonly tenantId?: string
}

// ============================================================================
// Middleware context
// ============================================================================

export interface ConvexToolCallFns {
  query: <Query extends FunctionReference<'query'>>(
    fn: Query,
    args?: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>
  mutation: <Mutation extends FunctionReference<'mutation'>>(
    fn: Mutation,
    args?: FunctionArgs<Mutation>,
  ) => Promise<FunctionReturnType<Mutation>>
  action: <Action extends FunctionReference<'action'>>(
    fn: Action,
    args?: FunctionArgs<Action>,
  ) => Promise<FunctionReturnType<Action>>
}

export interface ConvexToolHandlerCtx<TRole extends string = string> extends ConvexToolCallFns {
  event: H3Event
  /** Resolved actor, or null if auth is 'none' or no credentials were provided. */
  actor: McpAuthIdentity<TRole> | null
  ok: <T>(data: T, summary?: string) => McpToolCallbackResult
  error: (
    category: ConvexErrorCategory,
    message: string,
    issues?: ConvexErrorIssue[],
  ) => McpToolCallbackResult
  preview: (preview: string | PreviewResult) => McpToolCallbackResult
  blocked: (preview: string | PreviewResult) => McpToolCallbackResult
}

export type ConvexToolMiddlewareCtx<TRole extends string = string> = ConvexToolHandlerCtx<TRole>

export type ConvexToolMiddleware<S extends AnyConvexSchema, TRole extends string = string> = (
  args: InferSchemaData<S>,
  ctx: ConvexToolMiddlewareCtx<TRole>,
  next: () => Promise<McpToolCallbackResult>,
) => McpToolCallbackResult | Promise<McpToolCallbackResult>

// ============================================================================
// Tool options (public — what users type)
// ============================================================================

export interface DefineConvexToolOptions<S extends AnyConvexSchema, TRole extends string = string> {
  /** Shared Convex schema — provides input validation and metadata. */
  schema: S
  /** Tool handler. Return plain data — the framework wraps it. */
  handler: (
    args: InferSchemaData<S>,
    ctx: ConvexToolHandlerCtx<TRole>,
  ) => unknown | Promise<unknown>

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
  /** Optional actor check evaluated for both visibility and execution. */
  check?: (actor: McpAuthIdentity<TRole>) => boolean | Promise<boolean>
  /** Enable trusted-caller injection for Convex calls using the resolved actor. Tools are hidden unless actor.tenantId exists. */
  scoped?: boolean
  /** Custom auth resolver for this tool. Default: reads event.context.mcpAuth. */
  resolveAuth?: (
    event: H3Event,
  ) => McpAuthIdentity<TRole> | null | Promise<McpAuthIdentity<TRole> | null>

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
  /** In-memory rate limit per tool name, isolated per authenticated caller when auth is enabled. Requires explicit `name`. */
  rateLimit?: { max: number; window: string }
  /** Preview function for destructive tools. Receives the same args as handler, plus the middleware context. */
  preview?: (
    args: InferSchemaData<S>,
    ctx: ConvexToolMiddlewareCtx<TRole>,
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
  middleware?: ConvexToolMiddleware<S, TRole>
  /** Guard to include/hide this tool per-request. Runs before built-in auth/scoped/check visibility rules. */
  enabled?: (event: H3Event) => boolean | Promise<boolean>
  /** Cache configuration (passed through to mcp-toolkit). */
  cache?: McpToolCache
}

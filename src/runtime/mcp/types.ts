import type { H3Event } from 'h3'
import type {
  McpToolAnnotations,
  McpToolCache,
  McpToolExtra,
  McpToolCallbackResult,
} from '@nuxtjs/mcp-toolkit/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { PropertyValidators } from 'convex/values'
import type { ZodRawShape } from 'zod'

import type { CheckPermissionFn, Resource } from '../composables/usePermissions'
import type { ConvexSchemaDefinition } from '../utils/define-convex-schema'
import type { ConvexErrorCategory, ConvexErrorIssue, ConvexToolOperation } from '../utils/types'

// ============================================================================
// Schema helpers (re-exported for convenience)
// ============================================================================

export type AnyConvexSchema = ConvexSchemaDefinition<unknown, PropertyValidators>

export type InferSchemaData<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<infer T, infer _V> ? T : never

export type InferSchemaValidators<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<unknown, infer V> ? V : never

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

export interface McpAuthIdentity {
  readonly role: string
  readonly userId: string
  readonly orgId?: string
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

export interface ConvexToolHandlerCtx<P extends string = string> extends ConvexToolCallFns {
  event: H3Event
  /** Resolved actor, or null if auth is 'none' or no credentials were provided. */
  actor: McpAuthIdentity | null
  /** Resolved org context for `scoped: true` tools. */
  org?: McpOrgContext
  can: (permission: P, resource?: Resource) => boolean
  /** Explicit raw Convex call lane for functions that do not accept service auth args. */
  public: ConvexToolCallFns
}

export type ConvexToolMiddlewareCtx<P extends string = string> = ConvexToolHandlerCtx<P>

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
  handler: (
    args: InferSchemaData<S>,
    extra: McpToolExtra,
    ctx: ConvexToolHandlerCtx<P>,
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
  /** Permission string checked via checkPermission. Requires createConvexTools factory or checkPermission option. */
  require?: P
  /** Enable org scoping. Requires createConvexTools with tenant config. Handler receives `{ org }` context. */
  scoped?: boolean

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
// Tenant / Org scoping for MCP tools
// ============================================================================

export interface McpTenantConfig {
  /** The field name used for org scoping (e.g. 'organizationId') */
  orgField: string
  /** Resolve orgId from the authenticated MCP identity. Return null if no org. */
  resolveOrgId: (actor: McpAuthIdentity) => string | null
}

export interface McpOrgContext {
  /** The resolved organization ID */
  id: string
  /** Whether a document belongs to this org (checks orgField) */
  owns: (doc: Record<string, unknown> | null) => boolean
}

// ============================================================================
// Factory
// ============================================================================

export interface CreateConvexToolsOptions<P extends string = string> {
  /** Permission check function from your permissions.config.ts */
  checkPermission: CheckPermissionFn<P>
  /** Custom auth resolver. Default: reads event.context.mcpAuth */
  resolveAuth?: (event: H3Event) => McpAuthIdentity | null | Promise<McpAuthIdentity | null>
  /** Tenant configuration for org-scoped tools */
  tenant?: McpTenantConfig
}

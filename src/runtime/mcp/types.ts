import type {
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
} from '@nuxtjs/mcp-toolkit/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'
import type { ZodRawShape } from 'zod'

import type { SchemaDefinition } from '../convex/shared/define-convex-schema.js'
import type { Delegation } from '../functions/define-delegation.js'
import type { TrellisDenialExplanation } from '../observability/index.js'
import type { NoInfer, ValidateSerializable } from '../types/type-utils.js'
import type { ConvexErrorCategory, ConvexErrorIssue, ConvexToolOperation } from '../utils/types.js'
import type { McpRateLimitStore } from './rate-limiter.js'

export type { SerializableValue, ValidateSerializable } from '../types/type-utils.js'

// ============================================================================
// Schema helpers (re-exported for convenience)
// ============================================================================

export type AnyConvexSchema = SchemaDefinition<unknown, PropertyValidators>

export type InferSchemaData<S extends AnyConvexSchema> =
  S extends SchemaDefinition<infer T, infer _V> ? T : never

export type InferSchemaValidators<S extends AnyConvexSchema> =
  S extends SchemaDefinition<unknown, infer V> ? V : never

export type ValidateToolArgs<S extends AnyConvexSchema, TArgs> =
  TArgs extends NoInfer<InferSchemaData<S>> ? TArgs : never

// ============================================================================
// Structured response envelope
// ============================================================================

export interface ConvexToolSuccessResult<T = unknown> {
  ok: true
  data: ValidateSerializable<T>
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
    explanation?: TrellisDenialExplanation
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
  confirmationToken?: string
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
  ok: <T>(data: ValidateSerializable<T>, summary?: string) => McpToolCallbackResult
  error: (
    category: ConvexErrorCategory,
    message: string,
    issues?: ConvexErrorIssue[],
    explanation?: TrellisDenialExplanation,
  ) => McpToolCallbackResult
  preview: (preview: string | PreviewResult) => McpToolCallbackResult
  blocked: (preview: string | PreviewResult) => McpToolCallbackResult
}

export type ConvexToolMiddleware<S extends AnyConvexSchema, TRole extends string = string> = (
  args: InferSchemaData<S>,
  ctx: ConvexToolHandlerCtx<TRole>,
  next: () => Promise<McpToolCallbackResult>,
) => McpToolCallbackResult | Promise<McpToolCallbackResult>

// ============================================================================
// Tool options (public — what users type)
// ============================================================================

type ConvexToolAuthMode = 'required' | 'optional' | 'none'

interface DefineConvexToolBaseOptions<S extends AnyConvexSchema, TRole extends string = string> {
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
  auth?: ConvexToolAuthMode
  /** Optional actor check evaluated for both visibility and execution. */
  check?: (actor: McpAuthIdentity<TRole>) => boolean | Promise<boolean>
  /** Enable trusted-forwarding injection for Convex calls using the resolved actor. Tools are hidden unless actor.tenantId exists. */
  scoped?: boolean
  /** Custom auth resolver for this tool. Default: reads event.context.mcpAuth. */
  resolveAuth?: (
    event: H3Event,
  ) => McpAuthIdentity<TRole> | null | Promise<McpAuthIdentity<TRole> | null>
  /**
   * Optional app-specific principal resolver for trusted forwarded calls.
   *
   * Use this when the target Convex handlers expect a richer business principal
   * than the transport-level MCP actor alone can express.
   */
  resolvePrincipal?: (ctx: {
    event: H3Event
    actor: McpAuthIdentity<TRole>
  }) => unknown | Promise<unknown>
  /** Optional represented identity for trusted forwarded calls. */
  resolveDelegation?: (ctx: {
    event: H3Event
    actor: McpAuthIdentity<TRole>
  }) => Delegation | null | Promise<Delegation | null>

  // ── Safety ────────────────────────────────────────────────
  /**
   * Destructive generic tools are not supported.
   *
   * Use `defineMcpApp(...).tool.fromOperation(...)` for destructive tools so
   * Trellis can bind confirmation to operation identity and previewed state.
   */
  destructive?: boolean
  /** Limit array field size for bulk operations. Field must exist in schema. */
  maxItems?: { field: keyof InferSchemaData<S> & string; limit: number }
  /**
   * Per-tool request budget. Requires explicit `name`.
   *
   * Without `rateLimitStore`, enforcement is process-local memory only.
   */
  rateLimit?: { max: number; window: string }
  /** Optional distributed rate-limit store for this tool. Prefer `createRedisMcpRateLimitStore(...)` for a first-party atomic implementation. */
  rateLimitStore?: McpRateLimitStore
  /** Preview function for destructive tools. Unsupported on generic tools; use operation-backed tools instead. */
  preview?: (
    args: InferSchemaData<S>,
    ctx: ConvexToolHandlerCtx<TRole>,
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

export type DefineConvexToolOptions<S extends AnyConvexSchema, TRole extends string = string> =
  | (Omit<DefineConvexToolBaseOptions<S, TRole>, 'scoped' | 'auth'> & {
      scoped: true
      auth: 'required'
    })
  | (Omit<DefineConvexToolBaseOptions<S, TRole>, 'scoped'> & {
      scoped?: false | undefined
      auth?: ConvexToolAuthMode
    })

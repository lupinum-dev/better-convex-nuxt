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
import type { ActingFor } from '../functions/define-acting-for.js'
import type {
  OperationPreviewEffect,
  OperationPreviewIssue,
} from '../functions/operation-preview.js'
import type { TrellisDenialExplanation } from '../observability/index.js'
import type { NoInfer, ValidateSerializable } from '../types/type-utils.js'
import type { ConvexErrorCategory, ConvexErrorIssue } from '../utils/types.js'
import type { McpRateLimitStore } from './rate-limiter.js'
import type { TrellisUnsafePermit } from './unsafe-permit.js'

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

type ToolFieldName<S extends AnyConvexSchema> = [keyof InferSchemaData<S> & string] extends [never]
  ? string
  : keyof InferSchemaData<S> & string

// ============================================================================
// Structured response envelope
// ============================================================================

export interface ConvexToolSuccessResult<T = unknown> {
  ok: true
  data: ValidateSerializable<T>
  executed?: boolean
}

export interface ConvexToolPreviewResult {
  ok: true
  preview: PreviewResult
  awaitingConfirmation: boolean
  requiresConfirmation: boolean
  executed: false
}

export interface ConvexToolErrorResult {
  ok: false
  error: {
    category: ConvexErrorCategory
    code?: string
    message: string
    retryable: boolean
    issues?: ConvexErrorIssue[]
    details?: Record<string, unknown>
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
  operationId: string
  allowed: boolean
  summary: string
  blockers: OperationPreviewIssue[]
  warnings: OperationPreviewIssue[]
  effects: OperationPreviewEffect[]
  details?: ValidateSerializable<unknown>
  confirmation?: {
    token: string
    expiresAt: number
    operationId: string
  }
}

// ============================================================================
// Auth identity
// ============================================================================

export interface McpAuthIdentity<TRole extends string = string> {
  readonly role: TRole
  readonly userId: string
  readonly workspaceId?: string
}

// ============================================================================
// Middleware context
// ============================================================================

export interface ConvexToolCallFns {
  query: <Query extends FunctionReference<'query'>>(
    fn: Query,
    args?: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>
}

export interface ConvexToolHandlerCtx<TRole extends string = string> extends ConvexToolCallFns {
  event: H3Event
  /** Resolved appIdentity, or null if auth is 'none' or no credentials were provided. */
  appIdentity: McpAuthIdentity<TRole> | null
  ok: <T>(data: ValidateSerializable<T>, summary?: string) => McpToolCallbackResult
  error: (
    category: ConvexErrorCategory,
    message: string,
    issues?: ConvexErrorIssue[],
    explanation?: TrellisDenialExplanation,
    details?: Record<string, unknown>,
    code?: string,
  ) => McpToolCallbackResult
  preview: (preview: PreviewResult) => McpToolCallbackResult
  blocked: (preview: PreviewResult) => McpToolCallbackResult
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
export type ConvexToolEffect = 'read' | 'diagnostic' | 'external-service'

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

  // ── Effect & annotations ──────────────────────────────────
  /** Custom tool effect class. App writes must use defineMcpApp(...).tool.mutation/operation. */
  effect: ConvexToolEffect
  /** Required for external-service custom tools. */
  permit?: TrellisUnsafePermit
  /** Override auto-derived MCP annotations. */
  annotations?: Partial<McpToolAnnotations>

  // ── Auth ──────────────────────────────────────────────────
  /** Auth requirement. Default: 'none'. */
  auth?: ConvexToolAuthMode
  /** Optional appIdentity check evaluated for both visibility and execution. */
  check?: (appIdentity: McpAuthIdentity<TRole>) => boolean | Promise<boolean>
  /** Enable identity-forwarding injection for Convex calls using the resolved appIdentity. Tools are hidden unless appIdentity.workspaceId exists. */
  scoped?: boolean
  /** Custom auth resolver for this tool. Default: reads event.context.mcpAuth. */
  resolveAuth?: (
    event: H3Event,
  ) => McpAuthIdentity<TRole> | null | Promise<McpAuthIdentity<TRole> | null>
  /**
   * Optional app-specific caller resolver for trusted forwarded calls.
   *
   * Use this when the target Convex handlers expect a richer business caller
   * than the transport-level MCP appIdentity alone can express.
   */
  resolveCaller?: (ctx: {
    event: H3Event
    appIdentity: McpAuthIdentity<TRole>
  }) => unknown | Promise<unknown>
  /** Optional represented identity for trusted forwarded calls. */
  resolveActingFor?: (ctx: {
    event: H3Event
    appIdentity: McpAuthIdentity<TRole>
  }) => ActingFor | null | Promise<ActingFor | null>

  // ── Safety ────────────────────────────────────────────────
  /**
   * Destructive generic tools are not supported.
   *
   * Use `defineMcpApp(...).tool.operation(...)` for destructive tools so
   * Trellis can bind confirmation to operation identity and previewed state.
   */
  destructive?: boolean
  /** Limit array field size for bulk operations. Field must exist in schema. */
  maxItems?: { field: ToolFieldName<S>; limit: number }
  /**
   * Per-tool request budget. Requires explicit `name`.
   *
   * Without `rateLimitStore`, enforcement is process-local memory only.
   */
  rateLimit?: { max: number; window: string }
  /** Optional distributed rate-limit store for this tool. Prefer `createRedisMcpRateLimitStore(...)` for a first-party atomic implementation. */
  rateLimitStore?: McpRateLimitStore
  /** Generic previews are unsupported; use `defineMcpApp(...).tool.operation(...)`. */
  preview?: never

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

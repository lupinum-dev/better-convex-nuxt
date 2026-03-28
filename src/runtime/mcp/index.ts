// ── New API ──────────────────────────────────────────────────────────────────
export {
  defineConvexTool,
  createConvexTools,
} from './define-convex-tool'

export {
  wrapError,
  wrapSuccess,
  wrapPreview,
  withSummary,
} from './result-envelope'

export type {
  DefineConvexToolOptions,
  CreateConvexToolsOptions,
  McpAuthIdentity,
  PreviewResult,
  ConvexToolResult,
  ConvexToolSuccessResult,
  ConvexToolPreviewResult,
  ConvexToolErrorResult,
  ConvexToolMiddleware,
  ConvexToolMiddlewareCtx,
} from './types'

// ── Deprecated API ──────────────────────────────────────────────────────────
export {
  /** @deprecated Use `defineConvexTool` instead. */
  defineConvexMcpTool,
  type ConvexMcpToolDefinition,
  type ConvexMcpToolOptions,
  type ConvexMcpToolExtra,
  type ConvexMcpInputSchema,
} from './define-convex-mcp-tool'

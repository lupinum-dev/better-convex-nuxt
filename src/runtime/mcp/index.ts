// ── New API ──────────────────────────────────────────────────────────────────
export {
  defineConvexTool,
  createConvexTools,
} from './define-convex-tool'

export type {
  DefineConvexToolOptions,
  CreateConvexToolsOptions,
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

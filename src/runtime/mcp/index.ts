export {
  defineTool,
} from './define-convex-tool'

export {
  wrapError,
  wrapSuccess,
  wrapPreview,
  withSummary,
} from './result-envelope'

export type {
  DefineConvexToolOptions as DefineToolOptions,
  McpAuthIdentity,
  McpTenantConfig,
  McpTenantContext,
  PreviewResult,
  ConvexToolResult,
  ConvexToolSuccessResult,
  ConvexToolPreviewResult,
  ConvexToolErrorResult,
  ConvexToolMiddleware,
  ConvexToolHandlerCtx,
  ConvexToolMiddlewareCtx,
} from './types'

export {
  completable,
  defineMcpHandler,
  defineMcpPrompt,
  defineMcpResource,
  defineMcpTool,
  extractToolNames,
  imageResult,
} from '@nuxtjs/mcp-toolkit/server'

export { defineTool } from './define-convex-tool'

export { useMcpServer } from './use-mcp-server'

export { useMcpSession } from './use-mcp-session'

export { wrapError, wrapSuccess, wrapPreview, withSummary } from './result-envelope'

export type {
  DefineConvexToolOptions as DefineToolOptions,
  McpAuthIdentity,
  PreviewResult,
  ConvexToolResult,
  ConvexToolSuccessResult,
  ConvexToolPreviewResult,
  ConvexToolErrorResult,
  ConvexToolMiddleware,
  ConvexToolHandlerCtx,
  ConvexToolMiddlewareCtx,
} from './types'

export type {
  McpPromptExtra,
  McpResourceExtra,
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
  McpToolDefinition,
  McpToolExtra,
} from '@nuxtjs/mcp-toolkit/server'

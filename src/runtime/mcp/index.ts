export {
  completable,
  defineMcpHandler,
  defineMcpPrompt,
  defineMcpResource,
  defineMcpTool,
  extractToolNames,
  imageResult,
} from '@nuxtjs/mcp-toolkit/server'

export { defineTool } from './define-convex-tool.js'

export { useMcpServer } from './use-mcp-server.js'

export { useMcpSession } from './use-mcp-session.js'

export { wrapError, wrapSuccess, wrapPreview, withSummary } from './result-envelope.js'

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
} from './types.js'

export type {
  McpPromptExtra,
  McpResourceExtra,
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
  McpToolDefinition,
  McpToolExtra,
} from '@nuxtjs/mcp-toolkit/server'

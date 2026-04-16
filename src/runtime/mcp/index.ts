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
export { defineMcpApp } from './define-mcp-app.js'

export { useMcpServer } from './use-mcp-server.js'

export { useMcpSession } from './use-mcp-session.js'

export { wrapError, wrapSuccess, wrapPreview, withSummary } from './result-envelope.js'

export type {
  AnyConvexSchema,
  DefineConvexToolOptions as DefineToolOptions,
  InferSchemaData,
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
  DefineMcpAppOptions,
  McpConvexCaller,
  ToolFromOperationOptions,
  ToolOptions,
} from './define-mcp-app.js'

export type {
  McpPromptExtra,
  McpResourceExtra,
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
  McpToolDefinition,
  McpToolExtra,
} from '@nuxtjs/mcp-toolkit/server'

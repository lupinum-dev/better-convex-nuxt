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
export { defineMcpRuntime } from './define-mcp-runtime.js'

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
  DefineMcpRuntimeOptions,
  McpConvexCaller,
  ProjectToolOptions,
} from './define-mcp-runtime.js'

export type {
  McpPromptExtra,
  McpResourceExtra,
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
  McpToolDefinition,
  McpToolExtra,
} from '@nuxtjs/mcp-toolkit/server'

import type { NoInfer } from '../types/type-utils.js'

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
export { createRedisMcpRateLimitStore, RateLimitInfrastructureError } from './rate-limiter.js'

export { useMcpServer } from './use-mcp-server.js'

export { useMcpSession } from './use-mcp-session.js'

export {
  wrapError,
  wrapSuccess,
  wrapPreview,
  withSummary,
  withUntrustedText,
} from './result-envelope.js'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface CapabilityKeysByKey {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface ToolsByName {}

export interface RegisteredCapabilities {
  byKey: CapabilityKeysByKey
}

export interface RegisteredTools {
  byName: ToolsByName
}

export type RegisteredCapabilityKey = Extract<keyof CapabilityKeysByKey, string>
export type RegisteredToolName = Extract<keyof RegisteredTools['byName'], string>
export type RegisteredToolByName<TName extends RegisteredToolName> = ToolsByName[TName]

export type ValidateCapabilityKey<TKey extends string = string> =
  TKey extends NoInfer<RegisteredCapabilityKey> ? TKey : never

export type ValidateToolName<TName extends string = string> =
  TName extends NoInfer<RegisteredToolName> ? TName : never

export type {
  AnyConvexSchema,
  DefineConvexToolOptions as DefineToolOptions,
  InferSchemaData,
  ValidateToolArgs,
  SerializableValue,
  ValidateSerializable,
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
  McpRateLimitCheck,
  McpRateLimitConsumeInput,
  McpRateLimitStore,
  CreateRedisMcpRateLimitStoreOptions,
  RedisEvalLike,
} from './rate-limiter.js'

export type {
  DefineMcpAppOptions,
  McpConfirmationRedemptionInput,
  McpConfirmationStore,
  McpConvexCaller,
  ToolFromOperationOptions,
  ToolOptions,
  ValidateMcpToolOptions,
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

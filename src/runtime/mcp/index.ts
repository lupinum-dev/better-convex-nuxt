import type { NoInfer } from '../types/type-utils.js'

// Blessed first-reader Trellis 1.0 MCP surface.
//
// `defineMcpApp` returns `{ tool: { query, mutation, operation } }` factories
// that own auth, preview, confirmation, tenant binding, and result envelopes.
// First-reader docs and examples should use these only.
//
// Low-level helpers `defineMcpTool` / `defineTool` are exposed under
// `@lupinum/trellis/mcp/advanced` for tools that genuinely need handler
// control outside a single Convex ref.
export {
  completable,
  defineMcpHandler,
  defineMcpPrompt,
  defineMcpResource,
  extractToolNames,
  imageResult,
} from '@nuxtjs/mcp-toolkit/server'

export { defineMcpApp } from './define-mcp-app.js'
export { stampMcpToolSafety, trellisMcpToolSafetyKey } from './operation-binding.js'
export { createRedisMcpRateLimitStore, RateLimitInfrastructureError } from './rate-limiter.js'
export { unsafe } from './unsafe-permit.js'

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
export interface AccessKeysByKey {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface ToolsByName {}

export interface RegisteredAccess {
  byKey: AccessKeysByKey
}

export interface RegisteredTools {
  byName: ToolsByName
}

export type RegisteredAccessKey = Extract<keyof AccessKeysByKey, string>
export type RegisteredToolName = Extract<keyof RegisteredTools['byName'], string>
export type RegisteredToolByName<TName extends RegisteredToolName> = ToolsByName[TName]

export type ValidateAccessKey<TKey extends string = string> =
  TKey extends NoInfer<RegisteredAccessKey> ? TKey : never

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
  ConvexToolEffect,
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
  McpConfirmationConfirmationInput,
  McpConfirmationStore,
  McpConvexCaller,
  ToolOperationOptions,
  ToolOptions,
  ValidateMcpToolOptions,
} from './define-mcp-app.js'

export type { TrellisMcpToolSafety } from './operation-binding.js'
export type { TrellisUnsafePermit } from './unsafe-permit.js'

export type {
  McpPromptExtra,
  McpResourceExtra,
  McpToolAnnotations,
  McpToolCache,
  McpToolCallbackResult,
  McpToolDefinition,
  McpToolExtra,
} from '@nuxtjs/mcp-toolkit/server'

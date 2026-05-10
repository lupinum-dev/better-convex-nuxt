import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit/server'
import { v, type PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'
import type { ZodRawShape } from 'zod'

import {
  resolvePermissionKey,
  type PermissionHandle,
  type RegisteredPermissionKey,
} from '../auth/define-permission.js'
import {
  getFunctionName,
  type AnyActionFunction,
  type AnyMutationFunction,
  type AnyQueryFunction,
  type FunctionLikeArgs,
  type FunctionLikeReturnType,
} from '../convex/shared/convex-shared.js'
import { defineArgs } from '../convex/shared/define-convex-schema.js'
import type { Delegation } from '../functions/define-delegation.js'
import {
  getOperationMetadata,
  type OperationIdOf,
  type OperationKind,
  type OperationProjectionRef,
} from '../functions/define-operation.js'
import {
  getEventObservationState,
  sanitizeCorrelationId,
  type EventObservationState,
} from '../observability/envelope.js'
import {
  createDenialExplanation,
  createObservationEmitter,
  createWideSummary,
  type TrellisWideSummary,
  type TrellisObservabilityOptions,
} from '../observability/index.js'
import type { TrustedForwardingPurpose } from '../trusted-forwarding/envelope.js'
import type { NoInfer, SerializableValue } from '../types/type-utils.js'
import type { ConvexErrorCategory, ConvexToolOperation } from '../utils/types.js'
import { isNonEmptyPlainObject } from '../utils/value-helpers.js'
import { hashConfirmationValue } from './confirmation-token.js'
import { defineTool } from './define-convex-tool.js'
import {
  assertProductionConfirmationStore,
  createMemoryConfirmationStore,
  hashArgsForDiagnostics,
  hashPreviewVersion,
  replayedConfirmationFailure,
  signDestructivePreviewToken,
  validateDestructivePreviewState,
  verifyDestructiveConfirmationToken,
  type DestructiveConfirmationFailure,
  type McpConfirmationStore,
} from './destructive-confirmation.js'
import { normalizeMcpError } from './error-normalization.js'
import { markDestructiveExecuted } from './mcp-tool-result.js'
import {
  assertOperationBinding,
  getMcpToolSafety,
  toKebabCase,
  type AnyFunctionRef,
  type TrellisMcpToolSafety,
} from './operation-binding.js'
import { checkToolRateLimit, parseWindowString, type McpRateLimitStore } from './rate-limiter.js'
import type {
  AnyConvexSchema,
  ConvexToolHandlerCtx,
  ConvexToolMiddleware,
  PreviewResult,
} from './types.js'

type MaybePromise<T> = T | Promise<T>

export type {
  McpConfirmationRedemptionInput,
  McpConfirmationStore,
} from './destructive-confirmation.js'

type AnyQueryRef = AnyQueryFunction
type AnyMutationRef = AnyMutationFunction
type AnyActionRef = AnyActionFunction

export interface McpConvexCaller {
  query: <Query extends AnyQueryRef>(
    fn: Query,
    args?: FunctionLikeArgs<Query>,
    options?: McpConvexCallOptions,
  ) => Promise<FunctionLikeReturnType<Query>>
  mutation: <Mutation extends AnyMutationRef>(
    fn: Mutation,
    args?: FunctionLikeArgs<Mutation>,
    options?: McpConvexCallOptions,
  ) => Promise<FunctionLikeReturnType<Mutation>>
  action: <Action extends AnyActionRef>(
    fn: Action,
    args?: FunctionLikeArgs<Action>,
    options?: McpConvexCallOptions,
  ) => Promise<FunctionLikeReturnType<Action>>
}

export type McpConvexCallOptions = {
  trustedForwardingEnvelope?: {
    purpose?: TrustedForwardingPurpose
    jti?: string
  }
}

type ProjectionCapabilitySnapshot = Record<string, boolean>

// Architecture: this file wires MCP app execution. Error parsing, destructive
// confirmation, and result envelope semantics live in focused MCP runtime
// modules so app orchestration does not become a second source of truth.

type ProjectionRuntimeCtx<TPrincipal, TDelegation extends Delegation, TCapabilities, TRuntime> = {
  event: H3Event
  principal: TPrincipal
  delegation: TDelegation | null
  capabilities: TCapabilities
  runtime: TRuntime
  convex: McpConvexCaller
  observe: ReturnType<typeof createObservationEmitter>['emit']
  correlationId: string
  requestId: string
  wideSummary: TrellisWideSummary
}

export interface DefineMcpAppOptions<
  TPrincipal,
  TCapabilities extends ProjectionCapabilitySnapshot | null = ProjectionCapabilitySnapshot | null,
  TDelegation extends Delegation = Delegation,
  TRuntime = Record<string, never>,
> {
  callConvex: (
    event: H3Event,
    caller: { principal: TPrincipal; delegation: TDelegation | null },
  ) => MaybePromise<McpConvexCaller>
  resolvePrincipal: (event: H3Event) => MaybePromise<TPrincipal>
  resolveDelegation?: (ctx: {
    event: H3Event
    principal: TPrincipal
    convex: McpConvexCaller
  }) => MaybePromise<TDelegation | null>
  resolveCapabilities?: (ctx: {
    event: H3Event
    principal: TPrincipal
    delegation: TDelegation | null
    convex: McpConvexCaller
  }) => MaybePromise<TCapabilities>
  runtime?: (ctx: {
    event: H3Event
    principal: TPrincipal
    delegation: TDelegation | null
    capabilities: TCapabilities
    convex: McpConvexCaller
  }) => MaybePromise<TRuntime>
  principalKey?: (principal: TPrincipal) => string
  rateLimitStore?: McpRateLimitStore
  confirmationStore?: McpConfirmationStore
  observability?: TrellisObservabilityOptions
}

type CapabilityKey<TCapabilities> =
  TCapabilities extends Record<string, boolean>
    ? string extends keyof TCapabilities
      ? RegisteredPermissionKey
      : keyof TCapabilities & string
    : RegisteredPermissionKey

type ProjectToolMeta = {
  name?: string
  description?: string
  destructive?: boolean
}

function assertProductionRateLimitStore(
  toolName: string,
  rateLimit: { max: number; window: string } | undefined,
  rateLimitStore: unknown,
): void {
  if (process.env.NODE_ENV !== 'production' || !rateLimit || rateLimitStore) {
    return
  }

  throw new Error(
    `${toolName}: production MCP rate limiting requires an explicit distributed rate-limit store. Configure createRedisMcpRateLimitStore(...) and pass it as rateLimitStore.`,
  )
}

export interface ToolOptions<
  S extends AnyConvexSchema,
  TPrincipal,
  TDelegation extends Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null,
  TRuntime,
  TCall extends AnyFunctionRef = AnyMutationRef,
  _TPreview extends AnyFunctionRef | undefined = undefined,
> {
  schema: S
  call: TCall
  operation?: ConvexToolOperation
  preview?: never
  previewOperation?: never
  previewResult?: never
  permission?: PermissionHandle<CapabilityKey<TCapabilities>>
  enabled?: (
    ctx: ProjectionRuntimeCtx<TPrincipal, TDelegation, TCapabilities, TRuntime>,
  ) => MaybePromise<boolean>
  meta?: ProjectToolMeta
  safety?: TrellisMcpToolSafety
  rateLimit?: { max: number; window: string }
  rateLimitStore?: McpRateLimitStore
  maxItems?: {
    field: keyof import('./types.js').InferSchemaData<S> & string
    limit: number
  }
  middleware?: ConvexToolMiddleware<S>
  mapResult?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionLikeReturnType<TCall>
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
  }) => unknown
  summary?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionLikeReturnType<TCall>
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
  }) => string | undefined
  respond?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionLikeReturnType<TCall>
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
    ok: (data: unknown, summary?: string) => unknown
    error: (
      code: ConvexErrorCategory,
      message: string,
      issues?: import('../utils/types.js').ConvexErrorIssue[],
      explanation?: import('../observability/index.js').TrellisDenialExplanation,
      details?: Record<string, unknown>,
      errorCode?: string,
    ) => unknown
  }) => unknown
  outputSchema?: ZodRawShape
  group?: string
  tags?: string[]
}

type AnyOperationDefinition = {
  args: PropertyValidators
  id?: string
  name?: string
  kind?: OperationKind
}

type OperationPreviewPayload = {
  display: string | PreviewResult
  confirm: SerializableValue
  version?: SerializableValue
}

type OperationProjectionId<TOperation extends AnyOperationDefinition> = Extract<
  OperationIdOf<TOperation>,
  string
>

type ExecuteProjectionRef<
  TOperation extends AnyOperationDefinition,
  TRef extends AnyFunctionRef,
> = OperationProjectionRef<TRef, OperationProjectionId<TOperation>, 'execute'>

type PreviewProjectionRef<
  TOperation extends AnyOperationDefinition,
  TRef extends AnyFunctionRef | undefined,
> = TRef extends AnyFunctionRef
  ? OperationProjectionRef<TRef, OperationProjectionId<TOperation>, 'preview'>
  : never

export type McpDestructiveConfirmationMode = 'backend' | 'transport'

export interface ToolOperationOptions<
  TOperation extends AnyOperationDefinition,
  TPrincipal,
  TDelegation extends Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null,
  TRuntime,
  TExecute extends AnyFunctionRef = AnyMutationRef,
  TPreview extends AnyFunctionRef | undefined = undefined,
> extends Omit<
  ToolOptions<
    AnyConvexSchema,
    TPrincipal,
    TDelegation,
    TCapabilities,
    TRuntime,
    TExecute,
    TPreview
  >,
  'schema' | 'call' | 'preview' | 'operation' | 'previewOperation' | 'previewResult' | 'maxItems'
> {
  execute: ExecuteProjectionRef<TOperation, TExecute>
  preview?: PreviewProjectionRef<TOperation, TPreview>
  executeOperation?: ConvexToolOperation
  previewOperation?: ConvexToolOperation
  previewResult?: (ctx: {
    args: import('./types.js').InferSchemaData<AnyConvexSchema>
    result: TPreview extends AnyFunctionRef ? FunctionLikeReturnType<TPreview> : unknown
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
  }) => string | PreviewResult
  confirmationMode?: McpDestructiveConfirmationMode
  confirmationStore?: McpConfirmationStore
  schema?: AnyConvexSchema
  maxItems?: { field: string; limit: number }
}

export type ValidateMcpToolOptions<
  S extends AnyConvexSchema,
  TPrincipal,
  TDelegation extends Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null,
  TRuntime,
  TOptions,
> =
  TOptions extends ToolOptions<
    S,
    TPrincipal,
    TDelegation,
    TCapabilities,
    TRuntime,
    AnyFunctionRef,
    AnyFunctionRef | undefined
  >
    ? NoInfer<TOptions>
    : never

type ToolFactory<
  TPrincipal,
  TDelegation extends Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null,
  TRuntime,
> = {
  <
    S extends AnyConvexSchema,
    TCall extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    tool: ToolOptions<S, TPrincipal, TDelegation, TCapabilities, TRuntime, TCall, TPreview>,
  ): McpToolDefinition
  operation: <
    TOperation extends AnyOperationDefinition,
    TExecute extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    operation: TOperation,
    options: ToolOperationOptions<
      TOperation,
      TPrincipal,
      TDelegation,
      TCapabilities,
      TRuntime,
      TExecute,
      TPreview
    >,
  ) => McpToolDefinition
}

function defaultPrincipalKey(principal: unknown): string {
  if (principal === null || principal === undefined) return 'anonymous'
  if (
    typeof principal === 'string' ||
    typeof principal === 'number' ||
    typeof principal === 'boolean'
  ) {
    return String(principal)
  }

  try {
    return JSON.stringify(principal)
  } catch {
    return 'principal'
  }
}

function defaultTenantKey(principal: unknown): string {
  if (
    typeof principal === 'object' &&
    principal !== null &&
    'tenantId' in principal &&
    typeof (principal as { tenantId?: unknown }).tenantId === 'string'
  ) {
    return (principal as { tenantId: string }).tenantId
  }

  return 'global'
}

function normalizePreviewDisplay(raw: string | PreviewResult): PreviewResult {
  return typeof raw === 'string' ? { summary: raw } : raw
}

function isOperationPreviewPayload(value: unknown): value is OperationPreviewPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'display' in value &&
    'confirm' in value &&
    isNonEmptyPlainObject((value as OperationPreviewPayload).confirm)
  )
}

function permissionAllows<TCapabilities extends ProjectionCapabilitySnapshot | null>(
  capabilities: TCapabilities,
  permission: PermissionHandle<string> | undefined,
): boolean {
  if (!permission) return true
  if (!capabilities) return false
  return capabilities[resolvePermissionKey(permission)] === true
}

function assertDirectToolSafety(
  toolName: string,
  operation: ConvexToolOperation,
  ref: AnyFunctionRef,
  declaredSafety: TrellisMcpToolSafety | undefined,
): void {
  if (operation === 'query') return

  if (!declaredSafety) {
    throw new Error(
      `${toolName}: direct MCP ${operation} tools must declare bounded-write safety or use tool.operation(...).`,
    )
  }
  if (declaredSafety.kind !== 'bounded-write') {
    throw new Error(
      `${toolName}: direct MCP ${operation} tools only support bounded-write safety. Use tool.operation(...) for ${declaredSafety.kind}.`,
    )
  }

  const backendSafety = getMcpToolSafety(ref)
  if (!backendSafety) {
    throw new Error(
      `${toolName}: direct MCP ${operation} safety must be stamped on the backend/generated ref, not only declared on the tool.`,
    )
  }
  if (backendSafety.kind !== declaredSafety.kind) {
    throw new Error(
      `${toolName}: direct MCP ${operation} safety "${declaredSafety.kind}" does not match backend ref safety "${backendSafety.kind}".`,
    )
  }
}

function withProjectionCalls<TRole extends string, TPrincipal, TDelegation extends Delegation>(
  ctx: ConvexToolHandlerCtx<TRole>,
  projectionCtx: ProjectionRuntimeCtx<TPrincipal, TDelegation, unknown, unknown>,
): ConvexToolHandlerCtx<TRole> {
  return {
    ...ctx,
    query: projectionCtx.convex.query,
    mutation: projectionCtx.convex.mutation,
    action: projectionCtx.convex.action,
  }
}

async function callByOperation<TRef extends AnyFunctionRef>(
  convex: McpConvexCaller,
  operation: ConvexToolOperation,
  ref: TRef,
  args: FunctionLikeArgs<TRef>,
  options?: McpConvexCallOptions,
): Promise<FunctionLikeReturnType<TRef>> {
  switch (operation) {
    case 'query':
      return (await convex.query(
        ref as AnyQueryRef,
        args as FunctionLikeArgs<AnyQueryRef>,
        options,
      )) as FunctionLikeReturnType<TRef>
    case 'action':
      return (await convex.action(
        ref as AnyActionRef,
        args as FunctionLikeArgs<AnyActionRef>,
        options,
      )) as FunctionLikeReturnType<TRef>
    case 'mutation':
    default:
      return (await convex.mutation(
        ref as AnyMutationRef,
        args as FunctionLikeArgs<AnyMutationRef>,
        options,
      )) as FunctionLikeReturnType<TRef>
  }
}

/**
 * Build the Trellis MCP app surface over protected Convex refs.
 *
 * This is the canonical agent-facing Trellis API. It keeps MCP as a transport
 * over the same principal-first business runtime used by the rest of the app.
 */
export function defineMcpApp<
  TPrincipal,
  TCapabilities extends ProjectionCapabilitySnapshot | null = ProjectionCapabilitySnapshot | null,
  TDelegation extends Delegation = Delegation,
  TRuntime = Record<string, never>,
>(options: DefineMcpAppOptions<TPrincipal, TCapabilities, TDelegation, TRuntime>) {
  const principalKeyResolver = options.principalKey ?? defaultPrincipalKey
  const appRateLimitStore = options.rateLimitStore
  const appConfirmationStore = options.confirmationStore
  const confirmationStore = appConfirmationStore ?? createMemoryConfirmationStore()
  const requestCache = new WeakMap<
    H3Event,
    Promise<ProjectionRuntimeCtx<TPrincipal, TDelegation, TCapabilities, TRuntime>>
  >()

  const resolve = async (
    event: H3Event,
  ): Promise<ProjectionRuntimeCtx<TPrincipal, TDelegation, TCapabilities, TRuntime>> => {
    let cached = requestCache.get(event)
    if (!cached) {
      cached = (async () => {
        const config = createObservationEmitter(options.observability).config
        const headerName = config.correlation.header
        const eventContext = ((event.context as Record<string, unknown> | undefined) ??
          {}) as Record<string, unknown>
        ;(event as { context?: Record<string, unknown> }).context = eventContext
        const observationState = getEventObservationState(eventContext)
        const existingCorrelationId =
          sanitizeCorrelationId(event.headers.get(headerName)) ??
          sanitizeCorrelationId(observationState.correlationId)
        const correlationId = existingCorrelationId ?? config.correlation.generate()
        const requestId = observationState.requestId ?? crypto.randomUUID()
        eventContext.__trellis = {
          correlationId,
          originTransport: 'mcp',
          requestId,
        } satisfies EventObservationState
        const observability = createObservationEmitter(options.observability, {
          transport: 'mcp',
          originTransport: 'mcp',
          correlationId,
          requestId,
        })
        const wideSummary = createWideSummary({
          config: observability.config,
          method: event.method || 'POST',
          path: event.path || '(mcp)',
          requestId,
          initialContext: {
            correlationId,
            requestId,
            transport: 'mcp',
            originTransport: 'mcp',
            service: observability.config.service,
          },
        })
        const principal = await options.resolvePrincipal(event)
        const preDelegationConvex = await options.callConvex(event, {
          principal,
          delegation: null,
        })
        const delegation = options.resolveDelegation
          ? await options.resolveDelegation({
              event,
              principal,
              convex: preDelegationConvex,
            })
          : null
        const convex = await options.callConvex(event, {
          principal,
          delegation,
        })
        const capabilities = options.resolveCapabilities
          ? await options.resolveCapabilities({
              event,
              principal,
              delegation,
              convex,
            })
          : (null as TCapabilities)
        const runtime = options.runtime
          ? await options.runtime({
              event,
              principal,
              delegation,
              capabilities,
              convex,
            })
          : ({} as TRuntime)

        return {
          event,
          principal,
          delegation,
          capabilities,
          runtime,
          convex,
          observe: observability.emit,
          correlationId,
          requestId,
          wideSummary,
        }
      })()
      requestCache.set(event, cached)
    }

    return await cached
  }

  const tool = (<
    S extends AnyConvexSchema,
    TCall extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    tool: ToolOptions<S, TPrincipal, TDelegation, TCapabilities, TRuntime, TCall, TPreview>,
  ): McpToolDefinition => {
    if (tool.meta?.destructive || tool.preview) {
      throw new Error(
        'MCP tools with destructive or preview behavior must use tool.operation(...). Generic tool({...}) preview/destructive mode is not supported.',
      )
    }

    assertProductionRateLimitStore(
      tool.meta?.name ?? 'project-tool',
      tool.rateLimit,
      tool.rateLimitStore ?? appRateLimitStore,
    )

    const operation = tool.operation ?? 'mutation'
    assertDirectToolSafety(tool.meta?.name ?? 'project-tool', operation, tool.call, tool.safety)
    const middleware: ConvexToolMiddleware<S> | undefined =
      tool.rateLimit || tool.middleware
        ? async (args, ctx, next) => {
            if (tool.rateLimit) {
              const projectionCtx = await resolve(ctx.event)
              const bucket = [
                tool.meta?.name ?? 'project-tool',
                (options.principalKey ?? defaultPrincipalKey)(projectionCtx.principal),
              ].join(':')

              const check = await checkToolRateLimit(
                bucket,
                {
                  max: tool.rateLimit.max,
                  windowMs: parseWindowString(tool.rateLimit.window),
                },
                tool.rateLimitStore ?? appRateLimitStore,
              )

              if (!check.allowed) {
                return ctx.error(
                  'cooldown',
                  `Rate limit exceeded (${tool.rateLimit.max} per ${tool.rateLimit.window}). Try again in ${check.retryAfterSeconds} seconds.`,
                )
              }
            }

            if (!tool.middleware) {
              return await next()
            }

            const projectionCtx = await resolve(ctx.event)
            return await tool.middleware(args, withProjectionCalls(ctx, projectionCtx), next)
          }
        : undefined

    return defineTool({
      schema: tool.schema,
      auth: 'none',
      operation,
      name: tool.meta?.name,
      description: tool.meta?.description ?? tool.schema.description,
      destructive: tool.meta?.destructive ?? false,
      maxItems: tool.maxItems,
      middleware,
      outputSchema: tool.outputSchema,
      group: tool.group,
      tags: tool.tags,
      enabled: async (event) => {
        const ctx = await resolve(event)

        if (!permissionAllows(ctx.capabilities, tool.permission)) {
          await ctx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: tool.meta?.name ?? 'project-tool',
            reasonCode: 'tool.capability_denied',
            details: {
              explanation: createDenialExplanation({
                reasonCode: 'tool.capability_denied',
                decision: 'tool',
                message: 'Caller does not have the permission required for this tool.',
                suggestedAction: 'grant_capability',
              }),
            },
          })
          return false
        }
        const allowed = tool.enabled ? await tool.enabled(ctx) : true
        if (!allowed) {
          await ctx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: tool.meta?.name ?? 'project-tool',
            reasonCode: 'tool.disabled',
            details: {
              explanation: createDenialExplanation({
                reasonCode: 'tool.disabled',
                decision: 'tool',
                message: 'Tool is currently disabled for this request.',
                suggestedAction: 'contact_admin',
              }),
            },
          })
        }
        return allowed
      },
      handler: async (args, ctx) => {
        const projectionCtx = await resolve(ctx.event)
        if (!permissionAllows(projectionCtx.capabilities, tool.permission)) {
          const explanation = createDenialExplanation({
            reasonCode: 'tool.capability_denied',
            decision: 'tool',
            message: 'Caller does not have the permission required for this tool.',
            suggestedAction: 'grant_capability',
          })
          await projectionCtx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: tool.meta?.name ?? 'project-tool',
            reasonCode: 'tool.capability_denied',
            details: { explanation },
          })
          return ctx.error(
            'auth',
            'Caller does not have the permission required for this tool.',
            undefined,
            explanation,
          )
        }
        if (tool.enabled && !(await tool.enabled(projectionCtx))) {
          const explanation = createDenialExplanation({
            reasonCode: 'tool.disabled',
            decision: 'tool',
            message: 'Tool is currently disabled for this request.',
            suggestedAction: 'contact_admin',
          })
          await projectionCtx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: tool.meta?.name ?? 'project-tool',
            reasonCode: 'tool.disabled',
            details: { explanation },
          })
          return ctx.error(
            'auth',
            'Tool is currently disabled for this request.',
            undefined,
            explanation,
          )
        }
        projectionCtx.wideSummary.set({
          tool: tool.meta?.name ?? 'project-tool',
        })
        await projectionCtx.observe({
          name: 'tool.called',
          status: 'success',
          transport: 'mcp',
          tool: tool.meta?.name ?? 'project-tool',
        })
        try {
          const result = await callByOperation(
            projectionCtx.convex,
            operation,
            tool.call,
            Object.assign({}, args as Record<string, unknown>, {
              principal: projectionCtx.principal,
            }) as FunctionLikeArgs<TCall>,
          )

          if (tool.respond) {
            const responded = tool.respond({
              args,
              result,
              principal: projectionCtx.principal,
              capabilities: projectionCtx.capabilities,
              runtime: projectionCtx.runtime,
              ok: (data, summary) => (summary ? ctx.ok(data as SerializableValue, summary) : data),
              error: (category, message, issues, explanation, details, code) =>
                ctx.error(category, message, issues, explanation, details, code),
            })
            await projectionCtx.observe({
              name: 'tool.executed',
              status: 'success',
              transport: 'mcp',
              tool: tool.meta?.name ?? 'project-tool',
            })
            projectionCtx.wideSummary.emit({ status: 'success' })
            return responded
          }

          const mapped = tool.mapResult
            ? tool.mapResult({
                args,
                result,
                principal: projectionCtx.principal,
                capabilities: projectionCtx.capabilities,
                runtime: projectionCtx.runtime,
              })
            : result

          const summary = tool.summary?.({
            args,
            result,
            principal: projectionCtx.principal,
            capabilities: projectionCtx.capabilities,
            runtime: projectionCtx.runtime,
          })

          await projectionCtx.observe({
            name: 'tool.executed',
            status: 'success',
            transport: 'mcp',
            tool: tool.meta?.name ?? 'project-tool',
          })
          projectionCtx.wideSummary.emit({ status: 'success' })
          return summary ? ctx.ok(mapped as SerializableValue, summary) : mapped
        } catch (error) {
          const normalizedError = normalizeMcpError(error)
          const errorDetails = {
            category: normalizedError.category,
            message: normalizedError.message,
            ...(normalizedError.code ? { code: normalizedError.code } : {}),
          }
          await projectionCtx.observe({
            name: 'tool.failed',
            status: 'error',
            transport: 'mcp',
            tool: tool.meta?.name ?? 'project-tool',
            reasonCode: 'tool.execution_failed',
            details: errorDetails,
          })
          projectionCtx.wideSummary.emit({
            status: 'error',
            details: errorDetails,
          })
          return ctx.error(
            normalizedError.category,
            normalizedError.message,
            normalizedError.issues,
            undefined,
            normalizedError.details,
            normalizedError.code,
          )
        }
      },
    })
  }) as ToolFactory<TPrincipal, TDelegation, TCapabilities, TRuntime>

  tool.operation = <
    TOperation extends AnyOperationDefinition,
    TExecute extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    operation: TOperation,
    options: ToolOperationOptions<
      TOperation,
      TPrincipal,
      TDelegation,
      TCapabilities,
      TRuntime,
      TExecute,
      TPreview
    >,
  ): McpToolDefinition => {
    const metadata = getOperationMetadata(operation)
    if (!metadata.id) {
      throw new Error('tool.operation(...) requires an operation with an `id`.')
    }
    const operationId = metadata.id

    const isDestructive = metadata.kind === 'destructive'
    const confirmationMode = options.confirmationMode ?? 'backend'
    const toolName = options.meta?.name ?? toKebabCase(metadata.name ?? operationId)
    if (isDestructive && !options.preview) {
      throw new Error(
        `tool.operation(${metadata.name ?? metadata.id}) requires a preview ref for destructive operations.`,
      )
    }

    assertOperationBinding(operation, options.execute, options.preview)

    const baseSchema =
      options.schema ??
      defineArgs({
        description: options.meta?.description,
        args: operation.args,
      })

    const schema = isDestructive
      ? defineArgs({
          description: baseSchema.description,
          args: {
            ...baseSchema.args,
            _confirmationToken: v.optional(v.string()),
          },
        })
      : baseSchema

    const toolConfirmationStore = options.confirmationStore ?? confirmationStore

    assertProductionRateLimitStore(
      toolName,
      options.rateLimit,
      options.rateLimitStore ?? appRateLimitStore,
    )
    assertProductionConfirmationStore({
      toolName,
      destructive: isDestructive,
      confirmationMode,
      hasExplicitConfirmationStore: Boolean(options.confirmationStore ?? appConfirmationStore),
    })

    return defineTool({
      schema,
      auth: 'none',
      name: toolName,
      description: options.meta?.description ?? schema.description,
      operation: options.executeOperation ?? 'mutation',
      destructive: false,
      preview: undefined,
      maxItems: options.maxItems,
      outputSchema: options.outputSchema,
      group: options.group,
      tags: options.tags,
      middleware:
        options.rateLimit || options.middleware
          ? async (args, ctx, next) => {
              if (options.rateLimit) {
                const projectionCtx = await resolve(ctx.event)
                const bucket = [
                  options.meta?.name ?? metadata.name ?? operationId,
                  principalKeyResolver(projectionCtx.principal),
                ].join(':')

                const check = await checkToolRateLimit(
                  bucket,
                  {
                    max: options.rateLimit.max,
                    windowMs: parseWindowString(options.rateLimit.window),
                  },
                  options.rateLimitStore ?? appRateLimitStore,
                )

                if (!check.allowed) {
                  return ctx.error(
                    'cooldown',
                    `Rate limit exceeded (${options.rateLimit.max} per ${options.rateLimit.window}). Try again in ${check.retryAfterSeconds} seconds.`,
                  )
                }
              }

              if (!options.middleware) {
                return await next()
              }

              return await options.middleware(args, ctx, next)
            }
          : undefined,
      enabled: async (event) => {
        const ctx = await resolve(event)

        if (!permissionAllows(ctx.capabilities, options.permission)) {
          await ctx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? operationId,
            operation: operationId,
            reasonCode: 'tool.capability_denied',
            details: {
              explanation: createDenialExplanation({
                reasonCode: 'tool.capability_denied',
                decision: 'tool',
                message: 'Caller does not have the permission required for this tool.',
                suggestedAction: 'grant_capability',
              }),
            },
          })
          return false
        }
        const allowed = options.enabled ? await options.enabled(ctx) : true
        if (!allowed) {
          await ctx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? operationId,
            operation: operationId,
            reasonCode: 'tool.disabled',
            details: {
              explanation: createDenialExplanation({
                reasonCode: 'tool.disabled',
                decision: 'tool',
                message: 'Tool is currently disabled for this request.',
                suggestedAction: 'contact_admin',
              }),
            },
          })
        }
        return allowed
      },
      handler: async (rawArgs, ctx) => {
        const projectionCtx = await resolve(ctx.event)
        if (!permissionAllows(projectionCtx.capabilities, options.permission)) {
          const explanation = createDenialExplanation({
            reasonCode: 'tool.capability_denied',
            decision: 'tool',
            message: 'Caller does not have the permission required for this tool.',
            suggestedAction: 'grant_capability',
          })
          await projectionCtx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? operationId,
            operation: operationId,
            reasonCode: 'tool.capability_denied',
            details: { explanation },
          })
          return ctx.error(
            'auth',
            'Caller does not have the permission required for this tool.',
            undefined,
            explanation,
          )
        }
        if (options.enabled && !(await options.enabled(projectionCtx))) {
          const explanation = createDenialExplanation({
            reasonCode: 'tool.disabled',
            decision: 'tool',
            message: 'Tool is currently disabled for this request.',
            suggestedAction: 'contact_admin',
          })
          await projectionCtx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? operationId,
            operation: operationId,
            reasonCode: 'tool.disabled',
            details: { explanation },
          })
          return ctx.error(
            'auth',
            'Tool is currently disabled for this request.',
            undefined,
            explanation,
          )
        }
        const fullArgs = rawArgs as Record<string, unknown>
        const confirmationToken =
          typeof fullArgs._confirmationToken === 'string' ? fullArgs._confirmationToken : undefined
        const executeArgs = Object.fromEntries(
          Object.entries(fullArgs).filter(([key]) => key !== '_confirmationToken'),
        )
        const executePath = getFunctionName(options.execute)
        const previewPath = options.preview ? getFunctionName(options.preview) : executePath
        const principalKey = principalKeyResolver(projectionCtx.principal)
        const tenantKey = defaultTenantKey(projectionCtx.principal)
        const argsHash = await hashConfirmationValue(executeArgs)
        const argsFieldHashes = await hashArgsForDiagnostics(executeArgs)
        const confirmationBinding = {
          operationId,
          executePath,
          previewPath,
          principalKey,
          tenantKey,
          argsHash,
          argsFieldHashes,
        }
        projectionCtx.wideSummary.set({
          tool: options.meta?.name ?? metadata.name ?? operationId,
          operation: operationId,
        })
        await projectionCtx.observe({
          name: 'tool.called',
          status: 'success',
          transport: 'mcp',
          tool: options.meta?.name ?? metadata.name ?? operationId,
          operation: operationId,
        })

        const finalizeResult = (result: FunctionLikeReturnType<TExecute>) => {
          if (options.respond) {
            return options.respond({
              args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
              result,
              principal: projectionCtx.principal,
              capabilities: projectionCtx.capabilities,
              runtime: projectionCtx.runtime,
              ok: (data, summary) => (summary ? ctx.ok(data as SerializableValue, summary) : data),
              error: (category, message, issues, explanation, details, code) =>
                ctx.error(category, message, issues, explanation, details, code),
            })
          }

          const mapped = options.mapResult
            ? options.mapResult({
                args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
                result,
                principal: projectionCtx.principal,
                capabilities: projectionCtx.capabilities,
                runtime: projectionCtx.runtime,
              })
            : result

          const summary = options.summary?.({
            args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
            result,
            principal: projectionCtx.principal,
            capabilities: projectionCtx.capabilities,
            runtime: projectionCtx.runtime,
          })

          return summary ? ctx.ok(mapped as SerializableValue, summary) : mapped
        }

        const normalizeOperationPreview = (previewResult: unknown): OperationPreviewPayload => {
          if (options.previewResult) {
            return {
              display: options.previewResult({
                args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
                result: previewResult as TPreview extends AnyFunctionRef
                  ? FunctionLikeReturnType<TPreview>
                  : unknown,
                principal: projectionCtx.principal,
                capabilities: projectionCtx.capabilities,
                runtime: projectionCtx.runtime,
              }),
              confirm: executeArgs as SerializableValue,
            }
          }

          if (!isOperationPreviewPayload(previewResult)) {
            throw new Error(
              `tool.operation(${metadata.name ?? metadata.id}) preview must return { display, confirm } with a non-empty plain-object confirm payload.`,
            )
          }

          return previewResult
        }

        const returnConfirmationFailure = async (failure: DestructiveConfirmationFailure) => {
          await projectionCtx.observe({
            name: 'operation.confirm.drifted',
            status: 'deny',
            transport: 'mcp',
            operation: operationId,
            tool: options.meta?.name ?? metadata.name ?? operationId,
            reasonCode: 'tool.confirmation_mismatch',
            details: {
              ...failure.details,
              explanation: failure.explanation,
            },
          })
          return ctx.error(
            failure.category,
            failure.message,
            undefined,
            failure.explanation,
            failure.details,
            failure.code,
          )
        }

        let operationExecuteJti: string | undefined
        if (isDestructive) {
          if (!options.preview) {
            return ctx.error('server', 'Destructive operation is missing a preview ref.')
          }

          if (!confirmationToken) {
            await projectionCtx.observe({
              name: 'operation.preview.started',
              status: 'success',
              transport: 'mcp',
              operation: operationId,
              tool: options.meta?.name ?? metadata.name ?? operationId,
            })
            const previewResult = await callByOperation(
              projectionCtx.convex,
              options.previewOperation ?? 'query',
              options.preview as PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>,
              executeArgs as FunctionLikeArgs<
                PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>
              >,
            )

            const previewPayload = normalizeOperationPreview(previewResult)
            const display = normalizePreviewDisplay(previewPayload.display)
            const previewHash = await hashConfirmationValue(previewPayload.confirm)
            const versionHash = await hashPreviewVersion(previewPayload.version)
            await projectionCtx.observe({
              name: 'operation.preview.completed',
              status: 'success',
              transport: 'mcp',
              operation: operationId,
              tool: options.meta?.name ?? metadata.name ?? operationId,
            })

            if (display.blocked) {
              return ctx.blocked(display)
            }

            const signedToken = await signDestructivePreviewToken({
              binding: confirmationBinding,
              previewHash,
              versionHash,
            })

            await projectionCtx.observe({
              name: 'tool.confirmation.required',
              status: 'success',
              transport: 'mcp',
              operation: operationId,
              tool: options.meta?.name ?? metadata.name ?? operationId,
            })
            projectionCtx.wideSummary.emit({
              status: 'success',
              details: { awaitingConfirmation: true },
            })
            return ctx.preview({
              ...display,
              confirmationToken: signedToken,
            })
          }

          const confirmation = await verifyDestructiveConfirmationToken(
            confirmationToken,
            confirmationBinding,
          )
          if (!confirmation.ok) {
            return await returnConfirmationFailure(confirmation.failure)
          }
          const payload = confirmation.payload
          operationExecuteJti = payload.jti

          const previewResult = await callByOperation(
            projectionCtx.convex,
            options.previewOperation ?? 'query',
            options.preview as PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>,
            executeArgs as FunctionLikeArgs<
              PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>
            >,
          )

          const previewPayload = normalizeOperationPreview(previewResult)
          const display = normalizePreviewDisplay(previewPayload.display)

          const previewHash = await hashConfirmationValue(previewPayload.confirm)
          const versionHash = await hashPreviewVersion(previewPayload.version)
          const previewFailure = validateDestructivePreviewState({
            payload,
            blocked: display.blocked === true,
            previewHash,
            versionHash,
          })
          if (previewFailure) {
            return await returnConfirmationFailure(previewFailure)
          }

          await projectionCtx.observe({
            name: 'operation.confirm.validated',
            status: 'success',
            transport: 'mcp',
            operation: operationId,
            tool: options.meta?.name ?? metadata.name ?? operationId,
          })

          const redemption = await toolConfirmationStore.redeem({
            payload,
            operationId,
            principalKey,
            tenantKey,
            argsHash,
            previewHash,
            executePath,
            previewPath,
          })
          if (redemption === 'replayed') {
            return await returnConfirmationFailure(replayedConfirmationFailure())
          }
        }

        try {
          const result = await callByOperation(
            projectionCtx.convex,
            options.executeOperation ?? 'mutation',
            options.execute,
            Object.assign({}, executeArgs as Record<string, unknown>, {
              ...(confirmationToken && confirmationMode === 'backend'
                ? { _confirmationToken: confirmationToken }
                : {}),
            }) as FunctionLikeArgs<TExecute>,
            confirmationToken && isDestructive
              ? {
                  trustedForwardingEnvelope: {
                    purpose: 'operation-execute',
                    ...(operationExecuteJti ? { jti: operationExecuteJti } : {}),
                  },
                }
              : undefined,
          )

          await projectionCtx.observe({
            name: 'tool.executed',
            status: 'success',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? operationId,
            operation: operationId,
          })
          projectionCtx.wideSummary.emit({ status: 'success' })
          const finalized = finalizeResult(result)
          return isDestructive
            ? markDestructiveExecuted(finalized, (value) => ctx.ok(value as SerializableValue))
            : finalized
        } catch (error) {
          const normalizedError = normalizeMcpError(error)
          const errorDetails = {
            category: normalizedError.category,
            message: normalizedError.message,
            ...(normalizedError.code ? { code: normalizedError.code } : {}),
          }
          await projectionCtx.observe({
            name: 'tool.failed',
            status: 'error',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? operationId,
            operation: operationId,
            reasonCode: 'tool.execution_failed',
            details: errorDetails,
          })
          projectionCtx.wideSummary.emit({
            status: 'error',
            details: errorDetails,
          })
          return ctx.error(
            normalizedError.category,
            normalizedError.message,
            normalizedError.issues,
            undefined,
            normalizedError.details,
            normalizedError.code,
          )
        }
      },
    })
  }

  return {
    resolve,
    callConvex: options.callConvex,
    tool,
  }
}

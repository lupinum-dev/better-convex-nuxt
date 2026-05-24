import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit/server'
import { v, type PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'
import type { ZodRawShape } from 'zod'

import {
  resolvePermissionKey,
  type PermissionKeyHandle,
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
import { hashConfirmationValue } from '../functions/confirmation-token.js'
import type { ActingFor } from '../functions/define-acting-for.js'
import {
  isOperationPreviewEnvelope,
  getOperationMetadata,
  type OperationIdOf,
  type OperationKind,
  type OperationPreviewEnvelope,
  type OperationProjectionRef,
} from '../functions/define-operation.js'
import type { IdentityForwardingPurpose } from '../identity-forwarding/envelope.js'
import {
  getEventObservationState,
  sanitizeCorrelationId,
  type EventObservationState,
} from '../observability/envelope.js'
import {
  createDenialExplanation,
  createObservationEmitter,
  type TrellisObservabilityOptions,
} from '../observability/index.js'
import { createObservationSummary, type ObservationSummary } from '../observability/summary.js'
import type { NoInfer, SerializableValue } from '../types/type-utils.js'
import type { ConvexErrorCategory, ConvexToolOperation } from '../utils/types.js'
import { defineToolInternal as defineTool } from './define-convex-tool.js'
import {
  assertProductionConfirmationStore,
  createMemoryConfirmationStore,
  createDestructivePreviewToken,
  DEFAULT_MCP_CONFIRMATION_TTL_MS,
  hashArgsForDiagnostics,
  hashPreviewVersion,
  replayedConfirmationFailure,
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
  McpConfirmationConfirmationInput,
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
  identityForwardingEnvelope?: {
    purpose?: IdentityForwardingPurpose
    jti?: string
  }
}

type ProjectionAccessSnapshot = Record<string, boolean>

// Architecture: this file wires MCP app execution. Error parsing, destructive
// confirmation, and result envelope semantics live in focused MCP runtime
// modules so app orchestration does not become a second source of truth.

type ProjectionRuntimeCtx<TCaller, TActingFor extends ActingFor, TAccess, TRuntime> = {
  event: H3Event
  caller: TCaller
  actingFor: TActingFor | null
  recordAccess: TAccess
  runtime: TRuntime
  convex: McpConvexCaller
  observe: ReturnType<typeof createObservationEmitter>['emit']
  correlationId: string
  requestId: string
  wideSummary: ObservationSummary
}

export interface DefineMcpAppOptions<
  TCaller,
  TAccess extends ProjectionAccessSnapshot | null = ProjectionAccessSnapshot | null,
  TActingFor extends ActingFor = ActingFor,
  TRuntime = Record<string, never>,
> {
  callConvex: (
    event: H3Event,
    caller: { caller: TCaller; actingFor: TActingFor | null },
  ) => MaybePromise<McpConvexCaller>
  resolveCaller: (event: H3Event) => MaybePromise<TCaller>
  resolveActingFor?: (ctx: {
    event: H3Event
    caller: TCaller
    convex: McpConvexCaller
  }) => MaybePromise<TActingFor | null>
  resolveAccess?: (ctx: {
    event: H3Event
    caller: TCaller
    actingFor: TActingFor | null
    convex: McpConvexCaller
  }) => MaybePromise<TAccess>
  runtime?: (ctx: {
    event: H3Event
    caller: TCaller
    actingFor: TActingFor | null
    recordAccess: TAccess
    convex: McpConvexCaller
  }) => MaybePromise<TRuntime>
  callerKey?: (caller: TCaller) => string
  scopeKey?: (ctx: {
    caller: TCaller
    actingFor: TActingFor | null
    recordAccess: TAccess
    runtime: TRuntime
    args: Record<string, unknown>
  }) => MaybePromise<string>
  rateLimitStore?: McpRateLimitStore
  confirmationStore?: McpConfirmationStore
  confirmationTtlMs?: number
  observability?: TrellisObservabilityOptions
}

type AccessKey<TAccess> =
  TAccess extends Record<string, boolean>
    ? string extends keyof TAccess
      ? RegisteredPermissionKey
      : keyof TAccess & string
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

function assertNamedRateLimitedTool(toolName: string | undefined, rateLimit: unknown): void {
  if (!rateLimit || toolName) return
  throw new Error(
    'defineMcpApp: "rateLimit" requires meta.name so direct tools have distinct rate-limit buckets.',
  )
}

export interface ToolOptions<
  S extends AnyConvexSchema,
  TCaller,
  TActingFor extends ActingFor,
  TAccess extends ProjectionAccessSnapshot | null,
  TRuntime,
  TCall extends AnyFunctionRef = AnyMutationRef,
  _TPreview extends AnyFunctionRef | undefined = undefined,
> {
  schema: S
  call: TCall
  preview?: never
  previewOperation?: never
  previewResult?: never
  permission?: PermissionKeyHandle<AccessKey<TAccess>>
  enabled?: (
    ctx: ProjectionRuntimeCtx<TCaller, TActingFor, TAccess, TRuntime>,
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
    caller: TCaller
    recordAccess: TAccess
    runtime: TRuntime
  }) => unknown
  summary?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionLikeReturnType<TCall>
    caller: TCaller
    recordAccess: TAccess
    runtime: TRuntime
  }) => string | undefined
  respond?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionLikeReturnType<TCall>
    caller: TCaller
    recordAccess: TAccess
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
  [K in keyof OperationPreviewEnvelope]: OperationPreviewEnvelope[K]
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
  TCaller,
  TActingFor extends ActingFor,
  TAccess extends ProjectionAccessSnapshot | null,
  TRuntime,
  TExecute extends AnyFunctionRef = AnyMutationRef,
  TPreview extends AnyFunctionRef | undefined = undefined,
> extends Omit<
  ToolOptions<AnyConvexSchema, TCaller, TActingFor, TAccess, TRuntime, TExecute, TPreview>,
  'schema' | 'call' | 'preview' | 'operation' | 'previewOperation' | 'previewResult' | 'maxItems'
> {
  execute: ExecuteProjectionRef<TOperation, TExecute>
  preview?: PreviewProjectionRef<TOperation, TPreview>
  executeOperation?: ConvexToolOperation
  previewOperation?: ConvexToolOperation
  previewResult?: (ctx: {
    args: import('./types.js').InferSchemaData<AnyConvexSchema>
    result: TPreview extends AnyFunctionRef ? FunctionLikeReturnType<TPreview> : unknown
    caller: TCaller
    recordAccess: TAccess
    runtime: TRuntime
  }) => OperationPreviewEnvelope
  confirmationMode?: McpDestructiveConfirmationMode
  confirmationStore?: McpConfirmationStore
  scopeKey?: (ctx: {
    caller: TCaller
    actingFor: TActingFor | null
    recordAccess: TAccess
    runtime: TRuntime
    args: Record<string, unknown>
  }) => MaybePromise<string>
  schema?: AnyConvexSchema
  maxItems?: { field: string; limit: number }
}

export type ValidateMcpToolOptions<
  S extends AnyConvexSchema,
  TCaller,
  TActingFor extends ActingFor,
  TAccess extends ProjectionAccessSnapshot | null,
  TRuntime,
  TOptions,
> =
  TOptions extends ToolOptions<
    S,
    TCaller,
    TActingFor,
    TAccess,
    TRuntime,
    AnyFunctionRef,
    AnyFunctionRef | undefined
  >
    ? NoInfer<TOptions>
    : never

type ToolFactory<
  TCaller,
  TActingFor extends ActingFor,
  TAccess extends ProjectionAccessSnapshot | null,
  TRuntime,
> = {
  query: <S extends AnyConvexSchema, TCall extends AnyQueryRef = AnyQueryRef>(
    tool: ToolOptions<S, TCaller, TActingFor, TAccess, TRuntime, TCall>,
  ) => McpToolDefinition
  mutation: <S extends AnyConvexSchema, TCall extends AnyMutationRef = AnyMutationRef>(
    tool: ToolOptions<S, TCaller, TActingFor, TAccess, TRuntime, TCall>,
  ) => McpToolDefinition
  operation: <
    TOperation extends AnyOperationDefinition,
    TExecute extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    operation: TOperation,
    options: ToolOperationOptions<
      TOperation,
      TCaller,
      TActingFor,
      TAccess,
      TRuntime,
      TExecute,
      TPreview
    >,
  ) => McpToolDefinition
}

function defaultCallerKey(caller: unknown): string {
  if (caller === null || caller === undefined) return 'anonymous'
  if (typeof caller === 'string' || typeof caller === 'number' || typeof caller === 'boolean') {
    return String(caller)
  }

  try {
    return JSON.stringify(caller)
  } catch {
    return 'caller'
  }
}

function isBlockedPreview(preview: OperationPreviewPayload): boolean {
  return preview.allowed === false || preview.blockers.length > 0
}

function toMcpPreviewResult(input: {
  operationId: string
  preview: OperationPreviewPayload
  confirmation?: { token: string; expiresAt: number }
}): PreviewResult {
  return {
    operationId: input.operationId,
    allowed: !isBlockedPreview(input.preview),
    summary: input.preview.summary,
    blockers: input.preview.blockers,
    warnings: input.preview.warnings,
    effects: input.preview.effects,
    ...(input.preview.details === undefined ? {} : { details: input.preview.details }),
    ...(input.confirmation
      ? {
          confirmation: {
            token: input.confirmation.token,
            expiresAt: input.confirmation.expiresAt,
            operationId: input.operationId,
          },
        }
      : {}),
  }
}

function accessAllows<TAccess extends ProjectionAccessSnapshot | null>(
  recordAccess: TAccess,
  permission: PermissionKeyHandle<string> | undefined,
): boolean {
  if (!permission) return true
  if (!recordAccess) return false
  return recordAccess[resolvePermissionKey(permission)] === true
}

async function observeAccessBackendDrift<TCaller, TActingFor extends ActingFor, TAccess, TRuntime>(
  projectionCtx: ProjectionRuntimeCtx<TCaller, TActingFor, TAccess, TRuntime>,
  input: {
    tool: string
    operation?: string
    message: string
    code?: string
  },
): Promise<void> {
  const explanation = createDenialExplanation({
    reasonCode: 'tool.recordAccess_backend_drift',
    decision: 'authorize',
    message: 'MCP recordAccess projection allowed this tool, but backend authorization denied it.',
    suggestedAction: 'grant_recordAccess',
  })
  await projectionCtx.observe({
    name: 'tool.denied',
    status: 'deny',
    transport: 'mcp',
    tool: input.tool,
    ...(input.operation ? { operation: input.operation } : {}),
    reasonCode: 'tool.recordAccess_backend_drift',
    details: {
      explanation,
      category: 'auth',
      message: input.message,
      ...(input.code ? { code: input.code } : {}),
    },
  })
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

function withProjectionCalls<TRole extends string, TCaller, TActingFor extends ActingFor>(
  ctx: ConvexToolHandlerCtx<TRole>,
  projectionCtx: ProjectionRuntimeCtx<TCaller, TActingFor, unknown, unknown>,
): ConvexToolHandlerCtx<TRole> {
  return {
    ...ctx,
    query: projectionCtx.convex.query,
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
 * over the same caller-first business runtime used by the rest of the app.
 */
export function defineMcpApp<
  TCaller,
  TAccess extends ProjectionAccessSnapshot | null = ProjectionAccessSnapshot | null,
  TActingFor extends ActingFor = ActingFor,
  TRuntime = Record<string, never>,
>(options: DefineMcpAppOptions<TCaller, TAccess, TActingFor, TRuntime>) {
  const callerKeyResolver = options.callerKey ?? defaultCallerKey
  const appTenantKeyResolver = options.scopeKey
  const appRateLimitStore = options.rateLimitStore
  const appConfirmationStore = options.confirmationStore
  const confirmationStore = appConfirmationStore ?? createMemoryConfirmationStore()
  const confirmationTtlMs = options.confirmationTtlMs ?? DEFAULT_MCP_CONFIRMATION_TTL_MS
  const requestCache = new WeakMap<
    H3Event,
    Promise<ProjectionRuntimeCtx<TCaller, TActingFor, TAccess, TRuntime>>
  >()

  const resolve = async (
    event: H3Event,
  ): Promise<ProjectionRuntimeCtx<TCaller, TActingFor, TAccess, TRuntime>> => {
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
        const wideSummary = createObservationSummary({
          config: observability.config,
          initialContext: {
            correlationId,
            requestId,
            transport: 'mcp',
            originTransport: 'mcp',
            service: observability.config.service,
            method: event.method || 'POST',
            path: event.path || '(mcp)',
          },
        })
        const caller = await options.resolveCaller(event)
        const preDelegationConvex = await options.callConvex(event, {
          caller,
          actingFor: null,
        })
        const actingFor = options.resolveActingFor
          ? await options.resolveActingFor({
              event,
              caller,
              convex: preDelegationConvex,
            })
          : null
        const convex = await options.callConvex(event, {
          caller,
          actingFor,
        })
        const recordAccess = options.resolveAccess
          ? await options.resolveAccess({
              event,
              caller,
              actingFor,
              convex,
            })
          : (null as TAccess)
        const runtime = options.runtime
          ? await options.runtime({
              event,
              caller,
              actingFor,
              recordAccess,
              convex,
            })
          : ({} as TRuntime)

        return {
          event,
          caller,
          actingFor,
          recordAccess,
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

  const createDirectTool = <S extends AnyConvexSchema, TCall extends AnyFunctionRef>(
    operation: 'query' | 'mutation',
    definition: ToolOptions<S, TCaller, TActingFor, TAccess, TRuntime, TCall>,
  ): McpToolDefinition => {
    if (definition.meta?.destructive || definition.preview) {
      throw new Error(
        'MCP tools with destructive or preview behavior must use tool.operation(...). Direct tool lanes do not support preview/destructive mode.',
      )
    }

    assertNamedRateLimitedTool(definition.meta?.name, definition.rateLimit)
    const toolName = definition.meta?.name ?? 'project-tool'

    assertProductionRateLimitStore(
      toolName,
      definition.rateLimit,
      definition.rateLimitStore ?? appRateLimitStore,
    )

    assertDirectToolSafety(toolName, operation, definition.call, definition.safety)
    const middleware: ConvexToolMiddleware<S> | undefined =
      definition.rateLimit || definition.middleware
        ? async (args, ctx, next) => {
            if (definition.rateLimit) {
              const projectionCtx = await resolve(ctx.event)
              const bucket = [
                toolName,
                (options.callerKey ?? defaultCallerKey)(projectionCtx.caller),
              ].join(':')

              const check = await checkToolRateLimit(
                bucket,
                {
                  max: definition.rateLimit.max,
                  windowMs: parseWindowString(definition.rateLimit.window),
                },
                definition.rateLimitStore ?? appRateLimitStore,
              )

              if (!check.allowed) {
                return ctx.error(
                  'cooldown',
                  `Rate limit exceeded (${definition.rateLimit.max} per ${definition.rateLimit.window}). Try again in ${check.retryAfterSeconds} seconds.`,
                )
              }
            }

            if (!definition.middleware) {
              return await next()
            }

            const projectionCtx = await resolve(ctx.event)
            return await definition.middleware(args, withProjectionCalls(ctx, projectionCtx), next)
          }
        : undefined

    return defineTool({
      schema: definition.schema,
      effect: operation === 'query' ? 'read' : 'diagnostic',
      auth: 'none',
      operation,
      name: definition.meta?.name,
      description: definition.meta?.description ?? definition.schema.description,
      destructive: definition.meta?.destructive ?? false,
      maxItems: definition.maxItems,
      middleware,
      outputSchema: definition.outputSchema,
      group: definition.group,
      tags: definition.tags,
      enabled: async (event) => {
        const ctx = await resolve(event)

        if (!accessAllows(ctx.recordAccess, definition.permission)) {
          await ctx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: definition.meta?.name ?? 'project-tool',
            reasonCode: 'tool.recordAccess_denied',
            details: {
              explanation: createDenialExplanation({
                reasonCode: 'tool.recordAccess_denied',
                decision: 'tool',
                message: 'Caller does not have the permission required for this tool.',
                suggestedAction: 'grant_recordAccess',
              }),
            },
          })
          return false
        }
        const allowed = definition.enabled ? await definition.enabled(ctx) : true
        if (!allowed) {
          await ctx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: definition.meta?.name ?? 'project-tool',
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
        if (!accessAllows(projectionCtx.recordAccess, definition.permission)) {
          const explanation = createDenialExplanation({
            reasonCode: 'tool.recordAccess_denied',
            decision: 'tool',
            message: 'Caller does not have the permission required for this tool.',
            suggestedAction: 'grant_recordAccess',
          })
          await projectionCtx.observe({
            name: 'tool.denied',
            status: 'deny',
            transport: 'mcp',
            tool: definition.meta?.name ?? 'project-tool',
            reasonCode: 'tool.recordAccess_denied',
            details: { explanation },
          })
          return ctx.error(
            'auth',
            'Caller does not have the permission required for this tool.',
            undefined,
            explanation,
          )
        }
        if (definition.enabled && !(await definition.enabled(projectionCtx))) {
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
            tool: definition.meta?.name ?? 'project-tool',
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
          tool: definition.meta?.name ?? 'project-tool',
        })
        await projectionCtx.observe({
          name: 'tool.called',
          status: 'success',
          transport: 'mcp',
          tool: definition.meta?.name ?? 'project-tool',
        })
        try {
          const result = await callByOperation(
            projectionCtx.convex,
            operation,
            definition.call,
            Object.assign({}, args as Record<string, unknown>, {
              caller: projectionCtx.caller,
            }) as FunctionLikeArgs<TCall>,
          )

          if (definition.respond) {
            const responded = definition.respond({
              args,
              result,
              caller: projectionCtx.caller,
              recordAccess: projectionCtx.recordAccess,
              runtime: projectionCtx.runtime,
              ok: (data, summary) => (summary ? ctx.ok(data as SerializableValue, summary) : data),
              error: (category, message, issues, explanation, details, code) =>
                ctx.error(category, message, issues, explanation, details, code),
            })
            await projectionCtx.observe({
              name: 'tool.executed',
              status: 'success',
              transport: 'mcp',
              tool: definition.meta?.name ?? 'project-tool',
            })
            projectionCtx.wideSummary.emit({ status: 'success' })
            return responded
          }

          const mapped = definition.mapResult
            ? definition.mapResult({
                args,
                result,
                caller: projectionCtx.caller,
                recordAccess: projectionCtx.recordAccess,
                runtime: projectionCtx.runtime,
              })
            : result

          const summary = definition.summary?.({
            args,
            result,
            caller: projectionCtx.caller,
            recordAccess: projectionCtx.recordAccess,
            runtime: projectionCtx.runtime,
          })

          await projectionCtx.observe({
            name: 'tool.executed',
            status: 'success',
            transport: 'mcp',
            tool: definition.meta?.name ?? 'project-tool',
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
          if (normalizedError.category === 'auth') {
            await observeAccessBackendDrift(projectionCtx, {
              tool: definition.meta?.name ?? 'project-tool',
              message: normalizedError.message,
              ...(normalizedError.code ? { code: normalizedError.code } : {}),
            })
          } else {
            await projectionCtx.observe({
              name: 'tool.failed',
              status: 'error',
              transport: 'mcp',
              tool: definition.meta?.name ?? 'project-tool',
              reasonCode: 'tool.execution_failed',
              details: errorDetails,
            })
          }
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

  const tool: ToolFactory<TCaller, TActingFor, TAccess, TRuntime> = {
    query: (definition) => createDirectTool('query', definition),
    mutation: (definition) => createDirectTool('mutation', definition),
    operation: <
      TOperation extends AnyOperationDefinition,
      TExecute extends AnyFunctionRef = AnyMutationRef,
      TPreview extends AnyFunctionRef | undefined = undefined,
    >(
      operation: TOperation,
      options: ToolOperationOptions<
        TOperation,
        TCaller,
        TActingFor,
        TAccess,
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
      const toolPermission = options.permission ?? metadata.permissionKey

      const isDestructive = metadata.kind === 'destructive'
      const confirmationMode = options.confirmationMode ?? 'backend'
      const toolName = options.meta?.name ?? toKebabCase(metadata.name ?? operationId)
      if (isDestructive && !options.preview) {
        throw new Error(
          `tool.operation(${metadata.name ?? metadata.id}) requires a preview ref for destructive operations.`,
        )
      }
      const scopeKeyResolver = options.scopeKey ?? appTenantKeyResolver
      if (isDestructive && !scopeKeyResolver) {
        throw new Error(
          `tool.operation(${metadata.name ?? metadata.id}) requires an explicit scopeKey resolver for destructive confirmations. Use scopeKey: () => 'global' when no tenant applies.`,
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
        effect: 'diagnostic',
        auth: 'none',
        name: toolName,
        description: options.meta?.description ?? schema.description,
        operation: options.executeOperation ?? 'mutation',
        destructive: isDestructive,
        operationBackedDestructive: isDestructive,
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
                    callerKeyResolver(projectionCtx.caller),
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

          if (!accessAllows(ctx.recordAccess, toolPermission)) {
            await ctx.observe({
              name: 'tool.denied',
              status: 'deny',
              transport: 'mcp',
              tool: options.meta?.name ?? metadata.name ?? operationId,
              operation: operationId,
              reasonCode: 'tool.recordAccess_denied',
              details: {
                explanation: createDenialExplanation({
                  reasonCode: 'tool.recordAccess_denied',
                  decision: 'tool',
                  message: 'Caller does not have the permission required for this tool.',
                  suggestedAction: 'grant_recordAccess',
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
          if (!accessAllows(projectionCtx.recordAccess, toolPermission)) {
            const explanation = createDenialExplanation({
              reasonCode: 'tool.recordAccess_denied',
              decision: 'tool',
              message: 'Caller does not have the permission required for this tool.',
              suggestedAction: 'grant_recordAccess',
            })
            await projectionCtx.observe({
              name: 'tool.denied',
              status: 'deny',
              transport: 'mcp',
              tool: options.meta?.name ?? metadata.name ?? operationId,
              operation: operationId,
              reasonCode: 'tool.recordAccess_denied',
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
            typeof fullArgs._confirmationToken === 'string'
              ? fullArgs._confirmationToken
              : undefined
          const executeArgs = Object.fromEntries(
            Object.entries(fullArgs).filter(([key]) => key !== '_confirmationToken'),
          )
          const executePath = getFunctionName(options.execute)
          const previewPath = options.preview ? getFunctionName(options.preview) : executePath
          const callerKey = callerKeyResolver(projectionCtx.caller)
          const scopeKey = scopeKeyResolver
            ? await scopeKeyResolver({
                caller: projectionCtx.caller,
                actingFor: projectionCtx.actingFor,
                recordAccess: projectionCtx.recordAccess,
                runtime: projectionCtx.runtime,
                args: executeArgs,
              })
            : 'global'
          if (isDestructive && scopeKey.trim().length === 0) {
            throw new Error(
              `tool.operation(${metadata.name ?? metadata.id}) scopeKey resolver returned an empty tenant key.`,
            )
          }
          const argsHash = await hashConfirmationValue(executeArgs)
          const argsFieldHashes = await hashArgsForDiagnostics(executeArgs)
          const confirmationBinding = {
            operationId,
            executePath,
            previewPath,
            callerKey,
            scopeKey,
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
                caller: projectionCtx.caller,
                recordAccess: projectionCtx.recordAccess,
                runtime: projectionCtx.runtime,
                ok: (data, summary) =>
                  summary ? ctx.ok(data as SerializableValue, summary) : data,
                error: (category, message, issues, explanation, details, code) =>
                  ctx.error(category, message, issues, explanation, details, code),
              })
            }

            const mapped = options.mapResult
              ? options.mapResult({
                  args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
                  result,
                  caller: projectionCtx.caller,
                  recordAccess: projectionCtx.recordAccess,
                  runtime: projectionCtx.runtime,
                })
              : result

            const summary = options.summary?.({
              args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
              result,
              caller: projectionCtx.caller,
              recordAccess: projectionCtx.recordAccess,
              runtime: projectionCtx.runtime,
            })

            return summary ? ctx.ok(mapped as SerializableValue, summary) : mapped
          }

          const normalizeOperationPreview = (previewResult: unknown): OperationPreviewPayload => {
            if (options.previewResult) {
              return options.previewResult({
                args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
                result: previewResult as TPreview extends AnyFunctionRef
                  ? FunctionLikeReturnType<TPreview>
                  : unknown,
                caller: projectionCtx.caller,
                recordAccess: projectionCtx.recordAccess,
                runtime: projectionCtx.runtime,
              })
            }

            if (!isOperationPreviewEnvelope(previewResult)) {
              throw new Error(
                `tool.operation(${metadata.name ?? metadata.id}) preview must return an OperationPreviewEnvelope with allowed, summary, blockers, warnings, effects, and a non-empty plain-object confirm payload.`,
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

          const returnBackendFailure = async (error: unknown) => {
            const normalizedError = normalizeMcpError(error)
            const errorDetails = {
              category: normalizedError.category,
              message: normalizedError.message,
              ...(normalizedError.code ? { code: normalizedError.code } : {}),
            }
            if (normalizedError.category === 'auth') {
              await observeAccessBackendDrift(projectionCtx, {
                tool: options.meta?.name ?? metadata.name ?? operationId,
                operation: operationId,
                message: normalizedError.message,
                ...(normalizedError.code ? { code: normalizedError.code } : {}),
              })
            } else {
              await projectionCtx.observe({
                name: 'tool.failed',
                status: 'error',
                transport: 'mcp',
                tool: options.meta?.name ?? metadata.name ?? operationId,
                operation: operationId,
                reasonCode: 'tool.execution_failed',
                details: errorDetails,
              })
            }
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
              let previewResult: unknown
              try {
                previewResult = await callByOperation(
                  projectionCtx.convex,
                  options.previewOperation ?? 'query',
                  options.preview as PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>,
                  executeArgs as FunctionLikeArgs<
                    PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>
                  >,
                  {
                    identityForwardingEnvelope: {
                      purpose: 'operation-preview',
                    },
                  },
                )
              } catch (error) {
                return await returnBackendFailure(error)
              }

              const previewPayload = normalizeOperationPreview(previewResult)
              const previewHash = await hashConfirmationValue(previewPayload.confirm)
              const versionHash = await hashPreviewVersion(previewPayload.version)
              await projectionCtx.observe({
                name: 'operation.preview.completed',
                status: 'success',
                transport: 'mcp',
                operation: operationId,
                tool: options.meta?.name ?? metadata.name ?? operationId,
              })

              if (isBlockedPreview(previewPayload)) {
                return ctx.preview(
                  toMcpPreviewResult({
                    operationId,
                    preview: previewPayload,
                  }),
                )
              }

              const confirmation =
                confirmationMode === 'backend'
                  ? previewPayload.confirmation
                  : await createDestructivePreviewToken({
                      binding: confirmationBinding,
                      previewHash,
                      versionHash,
                      confirmationStore: toolConfirmationStore,
                      ttlMs: confirmationTtlMs,
                    })
              if (!confirmation) {
                return ctx.error(
                  'server',
                  'Backend destructive preview did not return a confirmation token.',
                )
              }

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
                ...toMcpPreviewResult({
                  operationId,
                  preview: previewPayload,
                  confirmation: {
                    token: confirmation.token,
                    expiresAt: confirmation.expiresAt,
                  },
                }),
              })
            }

            if (confirmationMode === 'transport') {
              const confirmation = await verifyDestructiveConfirmationToken(
                confirmationToken,
                confirmationBinding,
                toolConfirmationStore,
              )
              if (!confirmation.ok) {
                return await returnConfirmationFailure(confirmation.failure)
              }
              const payload = confirmation.payload
              operationExecuteJti = payload.jti

              let previewResult: unknown
              try {
                previewResult = await callByOperation(
                  projectionCtx.convex,
                  options.previewOperation ?? 'query',
                  options.preview as PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>,
                  executeArgs as FunctionLikeArgs<
                    PreviewProjectionRef<TOperation, Exclude<TPreview, undefined>>
                  >,
                  {
                    identityForwardingEnvelope: {
                      purpose: 'operation-preview',
                    },
                  },
                )
              } catch (error) {
                return await returnBackendFailure(error)
              }

              const previewPayload = normalizeOperationPreview(previewResult)

              const previewHash = await hashConfirmationValue(previewPayload.confirm)
              const versionHash = await hashPreviewVersion(previewPayload.version)
              const previewFailure = validateDestructivePreviewState({
                payload,
                blocked: isBlockedPreview(previewPayload),
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
                tokenHash: confirmation.tokenHash,
                payload,
                operationId,
                callerKey,
                scopeKey,
                argsHash,
                previewHash,
                executePath,
                previewPath,
              })
              if (redemption === 'replayed') {
                return await returnConfirmationFailure(replayedConfirmationFailure())
              }
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
              confirmationToken && isDestructive && confirmationMode === 'transport'
                ? {
                    identityForwardingEnvelope: {
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
            return await returnBackendFailure(error)
          }
        },
      })
    },
  }

  return {
    resolve,
    callConvex: options.callConvex,
    tool,
  }
}

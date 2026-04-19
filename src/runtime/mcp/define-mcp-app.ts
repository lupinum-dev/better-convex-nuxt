import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit/server'
import { v, type PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'
import { hash } from 'ohash'
import type { ZodRawShape } from 'zod'

import {
  resolvePermissionKey,
  type PermissionHandle,
  type RegisteredPermissionKey,
} from '../auth/define-permission.js'
import type { Delegation } from '../functions/define-delegation.js'
import { getOperationMetadata, type OperationKind } from '../functions/define-operation.js'
import {
  getFunctionName,
  type AnyActionFunction,
  type AnyMutationFunction,
  type AnyQueryFunction,
  type FunctionLikeArgs,
  type FunctionLikeReturnType,
} from '../utils/convex-shared.js'
import { defineArgs } from '../utils/define-convex-schema.js'
import {
  createDenialExplanation,
  createObservationEmitter,
  createWideSummary,
  type TrellisWideSummary,
  type TrellisObservabilityOptions,
} from '../utils/observability.js'
import {
  getEventObservationState,
  sanitizeCorrelationId,
  type EventObservationState,
} from '../utils/observability/envelope.js'
import type { ConvexErrorCategory, ConvexToolOperation } from '../utils/types.js'
import { signConfirmationToken, verifyConfirmationToken } from './confirmation-token.js'
import { defineTool } from './define-convex-tool.js'
import { assertOperationBinding, toKebabCase, type AnyFunctionRef } from './operation-binding.js'
import { globalRateLimiter, parseWindowString } from './rate-limiter.js'
import type { AnyConvexSchema, ConvexToolMiddleware, PreviewResult } from './types.js'

type MaybePromise<T> = T | Promise<T>

type AnyQueryRef = AnyQueryFunction
type AnyMutationRef = AnyMutationFunction
type AnyActionRef = AnyActionFunction
type ProjectionPreviewResult = string | PreviewResult
type PreviewResolver<S extends AnyConvexSchema, TPrincipal, TCapabilities, TRuntime> = (ctx: {
  args: import('./types.js').InferSchemaData<S>
  principal: TPrincipal
  capabilities: TCapabilities
  runtime: TRuntime
}) => MaybePromise<ProjectionPreviewResult>

export interface McpConvexCaller {
  query: <Query extends AnyQueryRef>(
    fn: Query,
    args?: FunctionLikeArgs<Query>,
  ) => Promise<FunctionLikeReturnType<Query>>
  mutation: <Mutation extends AnyMutationRef>(
    fn: Mutation,
    args?: FunctionLikeArgs<Mutation>,
  ) => Promise<FunctionLikeReturnType<Mutation>>
  action: <Action extends AnyActionRef>(
    fn: Action,
    args?: FunctionLikeArgs<Action>,
  ) => Promise<FunctionLikeReturnType<Action>>
}

type ProjectionCapabilitySnapshot = Record<string, boolean>

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
  TDelegation extends Delegation = Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null = ProjectionCapabilitySnapshot | null,
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

export interface ToolOptions<
  S extends AnyConvexSchema,
  TPrincipal,
  TDelegation extends Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null,
  TRuntime,
  TCall extends AnyFunctionRef = AnyMutationRef,
  TPreview extends AnyFunctionRef | undefined = undefined,
> {
  schema: S
  call: TCall
  operation?: ConvexToolOperation
  preview?: TPreview | PreviewResolver<S, TPrincipal, TCapabilities, TRuntime>
  previewOperation?: ConvexToolOperation
  previewResult?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: TPreview extends AnyFunctionRef ? FunctionLikeReturnType<TPreview> : unknown
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
  }) => string | PreviewResult
  permission?: PermissionHandle<CapabilityKey<TCapabilities>>
  enabled?: (
    ctx: ProjectionRuntimeCtx<TPrincipal, TDelegation, TCapabilities, TRuntime>,
  ) => MaybePromise<boolean>
  meta?: ProjectToolMeta
  rateLimit?: { max: number; window: string }
  maxItems?: { field: keyof import('./types.js').InferSchemaData<S> & string; limit: number }
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
      explanation?: import('../utils/observability.js').TrellisDenialExplanation,
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
  confirm: unknown
}

export interface ToolFromOperationOptions<
  _TOperation extends AnyOperationDefinition,
  TPrincipal,
  TDelegation extends Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null,
  TRuntime,
  TExecute extends AnyFunctionRef = AnyMutationRef,
  TPreview extends AnyFunctionRef | undefined = undefined,
> extends Omit<
  ToolOptions<AnyConvexSchema, TPrincipal, TDelegation, TCapabilities, TRuntime, TExecute, TPreview>,
  'schema' | 'call' | 'preview' | 'operation' | 'previewOperation'
> {
  execute: TExecute
  preview?: TPreview
  executeOperation?: ConvexToolOperation
  previewOperation?: ConvexToolOperation
  schema?: AnyConvexSchema
}

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
  fromOperation: <
    TOperation extends AnyOperationDefinition,
    TExecute extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    operation: TOperation,
    options: ToolFromOperationOptions<
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
  return typeof value === 'object' && value !== null && 'display' in value && 'confirm' in value
}

function permissionAllows<TCapabilities extends ProjectionCapabilitySnapshot | null>(
  capabilities: TCapabilities,
  permission: PermissionHandle<string> | undefined,
): boolean {
  if (!permission) return true
  if (!capabilities) return false
  return capabilities[resolvePermissionKey(permission)] === true
}

async function callByOperation<TRef extends AnyFunctionRef>(
  convex: McpConvexCaller,
  operation: ConvexToolOperation,
  ref: TRef,
  args: FunctionLikeArgs<TRef>,
): Promise<FunctionLikeReturnType<TRef>> {
  switch (operation) {
    case 'query':
      return (await convex.query(
        ref as AnyQueryRef,
        args as FunctionLikeArgs<AnyQueryRef>,
      )) as FunctionLikeReturnType<TRef>
    case 'action':
      return (await convex.action(
        ref as AnyActionRef,
        args as FunctionLikeArgs<AnyActionRef>,
      )) as FunctionLikeReturnType<TRef>
    case 'mutation':
    default:
      return (await convex.mutation(
        ref as AnyMutationRef,
        args as FunctionLikeArgs<AnyMutationRef>,
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
  TDelegation extends Delegation = Delegation,
  TCapabilities extends ProjectionCapabilitySnapshot | null = ProjectionCapabilitySnapshot | null,
  TRuntime = Record<string, never>,
>(options: DefineMcpAppOptions<TPrincipal, TDelegation, TCapabilities, TRuntime>) {
  const principalKeyResolver = options.principalKey ?? defaultPrincipalKey
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
        const convex = await options.callConvex(event, { principal, delegation })
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
    if (tool.meta?.destructive) {
      throw new Error(
        'Destructive MCP tools must use tool.fromOperation(...). Generic tool({...}) destructive mode is not supported.',
      )
    }

    const operation = tool.operation ?? 'mutation'
    const previewOperation = tool.previewOperation ?? 'query'
    const middleware: ConvexToolMiddleware<S> | undefined =
      tool.rateLimit || tool.middleware
        ? async (args, ctx, next) => {
            if (tool.rateLimit) {
              const projectionCtx = await resolve(ctx.event)
              const bucket = [
                tool.meta?.name ?? 'project-tool',
                (options.principalKey ?? defaultPrincipalKey)(projectionCtx.principal),
              ].join(':')

              const check = globalRateLimiter.check(bucket, {
                max: tool.rateLimit.max,
                windowMs: parseWindowString(tool.rateLimit.window),
              })

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

            return await tool.middleware(args, ctx, next)
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
      preview: tool.preview
        ? async (args, ctx): Promise<string | PreviewResult> => {
            const projectionCtx = await resolve(ctx.event)
            if (typeof tool.preview === 'function') {
              return await tool.preview({
                args,
                principal: projectionCtx.principal,
                capabilities: projectionCtx.capabilities,
                runtime: projectionCtx.runtime,
              })
            }

            const result = await callByOperation(
              projectionCtx.convex,
              previewOperation,
              tool.preview as Exclude<TPreview, undefined>,
              Object.assign({}, args as Record<string, unknown>, {
                principal: projectionCtx.principal,
              }) as FunctionLikeArgs<Exclude<TPreview, undefined>>,
            )

            if (!tool.previewResult) {
              return result as string | PreviewResult
            }

            return tool.previewResult({
              args,
              result: result as TPreview extends AnyFunctionRef
                ? FunctionLikeReturnType<TPreview>
                : unknown,
              principal: projectionCtx.principal,
              capabilities: projectionCtx.capabilities,
              runtime: projectionCtx.runtime,
            })
          }
        : undefined,
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
          return ctx.error('auth', 'Tool is currently disabled for this request.', undefined, explanation)
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
              ok: (data, summary) => (summary ? ctx.ok(data, summary) : data),
              error: (code, message, issues, explanation) =>
                ctx.error(code, message, issues, explanation),
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
          return summary ? ctx.ok(mapped, summary) : mapped
        } catch (error) {
          await projectionCtx.observe({
            name: 'tool.failed',
            status: 'error',
            transport: 'mcp',
            tool: tool.meta?.name ?? 'project-tool',
            reasonCode: 'tool.execution_failed',
            details: error instanceof Error ? { message: error.message } : undefined,
          })
          projectionCtx.wideSummary.emit({
            status: 'error',
            details: error instanceof Error ? { message: error.message } : undefined,
          })
          throw error
        }
      },
    })
  }) as ToolFactory<TPrincipal, TDelegation, TCapabilities, TRuntime>

  tool.fromOperation = <
    TOperation extends AnyOperationDefinition,
    TExecute extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    operation: TOperation,
    options: ToolFromOperationOptions<
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
      throw new Error('tool.fromOperation(...) requires an operation with an `id`.')
    }
    const operationId = metadata.id

    const isDestructive = metadata.kind === 'destructive'
    if (isDestructive && !options.preview) {
      throw new Error(
        `tool.fromOperation(${metadata.name ?? metadata.id}) requires a preview ref for destructive operations.`,
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

    return defineTool({
      schema,
      auth: 'none',
      name: options.meta?.name ?? toKebabCase(metadata.name ?? operationId),
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
                  options.meta?.name ?? metadata.name ?? metadata.id,
                  principalKeyResolver(projectionCtx.principal),
                ].join(':')

                const check = globalRateLimiter.check(bucket, {
                  max: options.rateLimit.max,
                  windowMs: parseWindowString(options.rateLimit.window),
                })

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
            tool: options.meta?.name ?? metadata.name ?? metadata.id,
            operation: metadata.id,
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
            tool: options.meta?.name ?? metadata.name ?? metadata.id,
            operation: metadata.id,
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
            tool: options.meta?.name ?? metadata.name ?? metadata.id,
            operation: metadata.id,
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
            tool: options.meta?.name ?? metadata.name ?? metadata.id,
            operation: metadata.id,
            reasonCode: 'tool.disabled',
            details: { explanation },
          })
          return ctx.error('auth', 'Tool is currently disabled for this request.', undefined, explanation)
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
        const argsHash = hash(executeArgs)
        projectionCtx.wideSummary.set({
          tool: options.meta?.name ?? metadata.name ?? metadata.id,
          operation: metadata.id,
        })
        await projectionCtx.observe({
          name: 'tool.called',
          status: 'success',
          transport: 'mcp',
          tool: options.meta?.name ?? metadata.name ?? metadata.id,
          operation: metadata.id,
        })

        const finalizeResult = (result: FunctionLikeReturnType<TExecute>) => {
          if (options.respond) {
            return options.respond({
              args: executeArgs as import('./types.js').InferSchemaData<AnyConvexSchema>,
              result,
              principal: projectionCtx.principal,
              capabilities: projectionCtx.capabilities,
              runtime: projectionCtx.runtime,
              ok: (data, summary) => (summary ? ctx.ok(data, summary) : data),
              error: (code, message, issues, explanation) =>
                ctx.error(code, message, issues, explanation),
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

          return summary ? ctx.ok(mapped, summary) : mapped
        }

        if (isDestructive) {
          if (!options.preview) {
            return ctx.error('server', 'Destructive operation is missing a preview ref.')
          }

          if (!confirmationToken) {
            await projectionCtx.observe({
              name: 'operation.preview.started',
              status: 'success',
              transport: 'mcp',
              operation: metadata.id,
              tool: options.meta?.name ?? metadata.name ?? metadata.id,
            })
            const previewResult = await callByOperation(
              projectionCtx.convex,
              options.previewOperation ?? 'query',
              options.preview,
              Object.assign({}, executeArgs as Record<string, unknown>, {
                principal: projectionCtx.principal,
              }) as FunctionLikeArgs<Exclude<TPreview, undefined>>,
            )

            if (!isOperationPreviewPayload(previewResult)) {
              throw new Error(
                `tool.fromOperation(${metadata.name ?? metadata.id}) preview must return { display, confirm }.`,
              )
            }

            const display = normalizePreviewDisplay(previewResult.display)
            const previewHash = hash(previewResult.confirm)
            await projectionCtx.observe({
              name: 'operation.preview.completed',
              status: 'success',
              transport: 'mcp',
              operation: metadata.id,
              tool: options.meta?.name ?? metadata.name ?? metadata.id,
            })

            if (display.blocked) {
              return ctx.blocked(display)
            }

            const signedToken = await signConfirmationToken({
              v: 1,
              operationId,
              executePath,
              previewPath,
              jti: crypto.randomUUID(),
              principalKey,
              tenantKey,
              argsHash,
              previewHash,
            })

            await projectionCtx.observe({
              name: 'tool.confirmation.required',
              status: 'success',
              transport: 'mcp',
              operation: metadata.id,
              tool: options.meta?.name ?? metadata.name ?? metadata.id,
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

          let payload
          try {
            payload = await verifyConfirmationToken(confirmationToken)
          } catch {
            const explanation = createDenialExplanation({
              reasonCode: 'tool.confirmation_mismatch',
              decision: 'destructive_confirm',
              message: 'Confirmation token is invalid or expired.',
              suggestedAction: 'retry_with_confirmation',
            })
            return ctx.error(
              'confirmation_required',
              'Invalid or expired confirmation token. Preview again before executing.',
              undefined,
              explanation,
            )
          }

          if (
            payload.operationId !== metadata.id ||
            payload.executePath !== executePath ||
            payload.previewPath !== previewPath ||
            payload.principalKey !== principalKey ||
            payload.tenantKey !== tenantKey ||
            payload.argsHash !== argsHash
          ) {
            await projectionCtx.observe({
              name: 'operation.confirm.drifted',
              status: 'deny',
              transport: 'mcp',
              operation: metadata.id,
              tool: options.meta?.name ?? metadata.name ?? metadata.id,
              reasonCode: 'tool.confirmation_mismatch',
              details: {
                explanation: createDenialExplanation({
                  reasonCode: 'tool.confirmation_mismatch',
                  decision: 'destructive_confirm',
                  message: 'Confirmation token no longer matches the previewed destructive state.',
                  suggestedAction: 'retry_with_confirmation',
                }),
              },
            })
            const explanation = createDenialExplanation({
              reasonCode: 'tool.confirmation_mismatch',
              decision: 'destructive_confirm',
              message: 'Confirmation token no longer matches the previewed destructive state.',
              suggestedAction: 'retry_with_confirmation',
            })
            return ctx.error(
              'conflict',
              'Confirmation token no longer matches this destructive request. Preview again before executing.',
              undefined,
              explanation,
            )
          }

          const previewResult = await callByOperation(
            projectionCtx.convex,
            options.previewOperation ?? 'query',
            options.preview,
            Object.assign({}, executeArgs as Record<string, unknown>, {
              principal: projectionCtx.principal,
            }) as FunctionLikeArgs<Exclude<TPreview, undefined>>,
          )

          if (!isOperationPreviewPayload(previewResult)) {
            throw new Error(
              `tool.fromOperation(${metadata.name ?? metadata.id}) preview must return { display, confirm }.`,
            )
          }

          const display = normalizePreviewDisplay(previewResult.display)
          if (display.blocked) {
            const explanation = createDenialExplanation({
              reasonCode: 'tool.confirmation_mismatch',
              decision: 'destructive_confirm',
              message: 'Previewed state is now blocked and can no longer be executed.',
              suggestedAction: 'retry_with_confirmation',
            })
            return ctx.error(
              'conflict',
              'Previewed state is blocked and can no longer be executed. Preview again before executing.',
              undefined,
              explanation,
            )
          }

          if (payload.previewHash !== hash(previewResult.confirm)) {
            await projectionCtx.observe({
              name: 'operation.confirm.drifted',
              status: 'deny',
              transport: 'mcp',
              operation: metadata.id,
              tool: options.meta?.name ?? metadata.name ?? metadata.id,
              reasonCode: 'tool.confirmation_mismatch',
              details: {
                explanation: createDenialExplanation({
                  reasonCode: 'tool.confirmation_mismatch',
                  decision: 'destructive_confirm',
                  message: 'Previewed state changed before confirmation completed.',
                  suggestedAction: 'retry_with_confirmation',
                }),
              },
            })
            const explanation = createDenialExplanation({
              reasonCode: 'tool.confirmation_mismatch',
              decision: 'destructive_confirm',
              message: 'Previewed state changed before confirmation completed.',
              suggestedAction: 'retry_with_confirmation',
            })
            return ctx.error(
              'conflict',
              'Previewed state changed before confirmation. Preview again before executing.',
              undefined,
              explanation,
            )
          }

          await projectionCtx.observe({
            name: 'operation.confirm.validated',
            status: 'success',
            transport: 'mcp',
            operation: metadata.id,
            tool: options.meta?.name ?? metadata.name ?? metadata.id,
          })
        }

        try {
          const result = await callByOperation(
            projectionCtx.convex,
            options.executeOperation ?? 'mutation',
            options.execute,
            Object.assign({}, executeArgs as Record<string, unknown>, {
              ...(confirmationToken ? { _confirmationToken: confirmationToken } : {}),
              principal: projectionCtx.principal,
            }) as FunctionLikeArgs<TExecute>,
          )

          await projectionCtx.observe({
            name: 'tool.executed',
            status: 'success',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? metadata.id,
            operation: metadata.id,
          })
          projectionCtx.wideSummary.emit({ status: 'success' })
          return finalizeResult(result)
        } catch (error) {
          await projectionCtx.observe({
            name: 'tool.failed',
            status: 'error',
            transport: 'mcp',
            tool: options.meta?.name ?? metadata.name ?? metadata.id,
            operation: metadata.id,
            reasonCode: 'tool.execution_failed',
            details: error instanceof Error ? { message: error.message } : undefined,
          })
          projectionCtx.wideSummary.emit({
            status: 'error',
            details: error instanceof Error ? { message: error.message } : undefined,
          })
          throw error
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

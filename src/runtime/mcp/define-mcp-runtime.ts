import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { H3Event } from 'h3'
import type { ZodRawShape } from 'zod'

import type { ConvexErrorCategory, ConvexToolOperation } from '../utils/types.js'
import { defineTool } from './define-convex-tool.js'
import { globalRateLimiter, parseWindowString } from './rate-limiter.js'
import type { AnyConvexSchema, ConvexToolMiddleware, PreviewResult } from './types.js'

type MaybePromise<T> = T | Promise<T>

type AnyQueryRef = FunctionReference<'query', 'public' | 'internal'>
type AnyMutationRef = FunctionReference<'mutation', 'public' | 'internal'>
type AnyActionRef = FunctionReference<'action', 'public' | 'internal'>
type AnyFunctionRef = AnyQueryRef | AnyMutationRef | AnyActionRef
type ProjectionPreviewResult = string | PreviewResult
type PreviewResolver<S extends AnySchema, TPrincipal, TCapabilities, TRuntime> = (ctx: {
  args: import('./types.js').InferSchemaData<S>
  principal: TPrincipal
  capabilities: TCapabilities
  runtime: TRuntime
}) => MaybePromise<ProjectionPreviewResult>

export interface McpConvexCaller {
  query: <Query extends AnyQueryRef>(
    fn: Query,
    args?: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>
  mutation: <Mutation extends AnyMutationRef>(
    fn: Mutation,
    args?: FunctionArgs<Mutation>,
  ) => Promise<FunctionReturnType<Mutation>>
  action: <Action extends AnyActionRef>(
    fn: Action,
    args?: FunctionArgs<Action>,
  ) => Promise<FunctionReturnType<Action>>
}

type ProjectionCapabilitySnapshot = Record<string, boolean>

type ProjectionRuntimeCtx<TPrincipal, TCapabilities, TRuntime> = {
  event: H3Event
  principal: TPrincipal
  capabilities: TCapabilities
  runtime: TRuntime
  convex: McpConvexCaller
}

export interface DefineMcpRuntimeOptions<
  TPrincipal,
  TCapabilities extends ProjectionCapabilitySnapshot | null = ProjectionCapabilitySnapshot | null,
  TRuntime = Record<string, never>,
> {
  callConvex: (event: H3Event) => MaybePromise<McpConvexCaller>
  resolvePrincipal: (event: H3Event) => MaybePromise<TPrincipal>
  resolveCapabilities?: (ctx: {
    event: H3Event
    principal: TPrincipal
    convex: McpConvexCaller
  }) => MaybePromise<TCapabilities>
  runtime?: (ctx: {
    event: H3Event
    principal: TPrincipal
    capabilities: TCapabilities
    convex: McpConvexCaller
  }) => MaybePromise<TRuntime>
  principalKey?: (principal: TPrincipal) => string
}

type AnySchema = AnyConvexSchema

type CapabilityKey<TCapabilities> =
  TCapabilities extends Record<string, boolean> ? keyof TCapabilities & string : string

type ProjectToolMeta = {
  name?: string
  description?: string
  destructive?: boolean
}

export interface ProjectToolOptions<
  S extends AnySchema,
  TPrincipal,
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
    result: TPreview extends AnyFunctionRef ? FunctionReturnType<TPreview> : unknown
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
  }) => string | PreviewResult
  capability?: CapabilityKey<TCapabilities>
  enabled?: (
    ctx: ProjectionRuntimeCtx<TPrincipal, TCapabilities, TRuntime>,
  ) => MaybePromise<boolean>
  meta?: ProjectToolMeta
  rateLimit?: { max: number; window: string }
  maxItems?: { field: keyof import('./types.js').InferSchemaData<S> & string; limit: number }
  middleware?: ConvexToolMiddleware<S>
  mapResult?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionReturnType<TCall>
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
  }) => unknown
  summary?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionReturnType<TCall>
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
  }) => string | undefined
  respond?: (ctx: {
    args: import('./types.js').InferSchemaData<S>
    result: FunctionReturnType<TCall>
    principal: TPrincipal
    capabilities: TCapabilities
    runtime: TRuntime
    ok: (data: unknown, summary?: string) => unknown
    error: (code: ConvexErrorCategory, message: string) => unknown
  }) => unknown
  outputSchema?: ZodRawShape
  group?: string
  tags?: string[]
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

function capabilityAllows<TCapabilities extends ProjectionCapabilitySnapshot | null>(
  capabilities: TCapabilities,
  capability: string | undefined,
): boolean {
  if (!capability) return true
  if (!capabilities) return false
  return capabilities[capability] === true
}

async function callByOperation<TRef extends AnyFunctionRef>(
  convex: McpConvexCaller,
  operation: ConvexToolOperation,
  ref: TRef,
  args: FunctionArgs<TRef>,
): Promise<FunctionReturnType<TRef>> {
  switch (operation) {
    case 'query':
      return (await convex.query(
        ref as AnyQueryRef,
        args as FunctionArgs<AnyQueryRef>,
      )) as FunctionReturnType<TRef>
    case 'action':
      return (await convex.action(
        ref as AnyActionRef,
        args as FunctionArgs<AnyActionRef>,
      )) as FunctionReturnType<TRef>
    case 'mutation':
    default:
      return (await convex.mutation(
        ref as AnyMutationRef,
        args as FunctionArgs<AnyMutationRef>,
      )) as FunctionReturnType<TRef>
  }
}

export function defineMcpRuntime<
  TPrincipal,
  TCapabilities extends ProjectionCapabilitySnapshot | null = ProjectionCapabilitySnapshot | null,
  TRuntime = Record<string, never>,
>(options: DefineMcpRuntimeOptions<TPrincipal, TCapabilities, TRuntime>) {
  const requestCache = new WeakMap<
    H3Event,
    Promise<ProjectionRuntimeCtx<TPrincipal, TCapabilities, TRuntime>>
  >()

  const resolve = async (
    event: H3Event,
  ): Promise<ProjectionRuntimeCtx<TPrincipal, TCapabilities, TRuntime>> => {
    let cached = requestCache.get(event)
    if (!cached) {
      cached = (async () => {
        const principal = await options.resolvePrincipal(event)
        const convex = await options.callConvex(event)
        const capabilities = options.resolveCapabilities
          ? await options.resolveCapabilities({
              event,
              principal,
              convex,
            })
          : (null as TCapabilities)
        const runtime = options.runtime
          ? await options.runtime({
              event,
              principal,
              capabilities,
              convex,
            })
          : ({} as TRuntime)

        return {
          event,
          principal,
          capabilities,
          runtime,
          convex,
        }
      })()
      requestCache.set(event, cached)
    }

    return await cached
  }

  const projectTool = <
    S extends AnySchema,
    TCall extends AnyFunctionRef = AnyMutationRef,
    TPreview extends AnyFunctionRef | undefined = undefined,
  >(
    tool: ProjectToolOptions<S, TPrincipal, TCapabilities, TRuntime, TCall, TPreview>,
  ): McpToolDefinition => {
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

        if (!capabilityAllows(ctx.capabilities, tool.capability)) {
          return false
        }

        return tool.enabled ? await tool.enabled(ctx) : true
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
              }) as FunctionArgs<Exclude<TPreview, undefined>>,
            )

            if (!tool.previewResult) {
              return result as string | PreviewResult
            }

            return tool.previewResult({
              args,
              result,
              principal: projectionCtx.principal,
              capabilities: projectionCtx.capabilities,
              runtime: projectionCtx.runtime,
            })
          }
        : undefined,
      handler: async (args, ctx) => {
        const projectionCtx = await resolve(ctx.event)
        const result = await callByOperation(
          projectionCtx.convex,
          operation,
          tool.call,
          Object.assign({}, args as Record<string, unknown>, {
            principal: projectionCtx.principal,
          }) as FunctionArgs<TCall>,
        )

        if (tool.respond) {
          return tool.respond({
            args,
            result,
            principal: projectionCtx.principal,
            capabilities: projectionCtx.capabilities,
            runtime: projectionCtx.runtime,
            ok: (data, summary) => (summary ? ctx.ok(data, summary) : data),
            error: (code, message) => ctx.error(code, message),
          })
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

        return summary ? ctx.ok(mapped, summary) : mapped
      },
    })
  }

  return {
    resolve,
    callConvex: options.callConvex,
    projectTool,
  }
}
